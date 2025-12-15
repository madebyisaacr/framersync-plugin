import {
	APIErrorCode,
	Client,
	collectPaginatedAPI,
	isFullBlock,
	isFullDatabase,
	isFullPage,
	isNotionClientError,
} from "@notionhq/client";
import pLimit from "p-limit";
import {
	GetDatabaseResponse,
	PageObjectResponse,
	RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { assert, formatDate, isDefined, isString, removeTimeFromISO } from "../utils";
import { CollectionField, CollectionItem, framer } from "framer-plugin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { blocksToHtml, richTextToHTML } from "./blocksToHTML";
import { PluginContext } from "../general/PluginContext";
import {
	updateCollection,
	updateCollectionPluginData,
	getFieldsById,
} from "../general/updateCollection";
import { FieldSettings } from "../general/FieldSettings";
import { markdownToHTML } from "../general/markdownToHTML";

export type FieldId = string;

const databasePagesByDatabaseId = {};

const apiBaseUrl =
	window.location.hostname === "localhost"
		? "http://localhost:8787/notion"
		: "https://framersync-workers.isaac-b49.workers.dev/notion";

// Storage for the notion API key.
const notionBearerStorageKey = "notionBearerToken";

const noneOptionID = "##NONE##";

const propertyConversionTypes = {
	checkbox: ["boolean"],
	title: ["string"],
	multi_select: ["enum", "string"],
	phone_number: ["string"],
	email: ["string"],
	created_time: ["date"],
	date: ["date"],
	last_edited_time: ["date"],
	files: ["file", "image"],
	number: ["number"],
	rich_text: ["formattedText", "string"],
	select: ["enum", "string"],
	status: ["enum", "string"],
	url: ["link", "string", "file"],
	unique_id: ["string", "number"],
	formula: ["string", "number", "boolean", "date", "link", "image", "file"],
	rollup: ["string", "number", "boolean", "date", "link", "image", "file"],
	created_by: [],
	last_edited_by: [],
	people: [],
	relation: [],
};

// The order in which we display slug fields
const slugFieldTypes: NotionProperty["type"][] = [
	"title",
	"rich_text",
	"unique_id",
	"formula",
	"rollup",
];

// Maximum number of concurrent requests to Notion API
// This is to prevent rate limiting.
const concurrencyLimit = 5;

export type NotionProperty = GetDatabaseResponse["properties"][string];

export async function getIntegrationContext(integrationData: object, databaseName: string) {
	const { databaseId } = integrationData;

	if (!databaseId) {
		return null;
	}

	try {
		assert(notion, "Notion client is not initialized");
		const database = await notion.databases.retrieve({ database_id: databaseId });

		return {
			database,
		};
	} catch (error) {
		if (isNotionClientError(error) && error.code === APIErrorCode.ObjectNotFound) {
			return Error(
				`The database "${databaseName}" was not found. Log in with Notion and select the Database to sync.`
			);
		}

		throw error;
	}
}

// A page in database consists of blocks.
// We allow configuration to include this as a field in the collection.
// This is used as an identifier to recognize that property and treat it as page content
export const pageContentField: CollectionField = {
	type: "formattedText",
	id: "page-content",
	name: "Content",
};

// Naive implementation to be authenticated, a token could be expired.
// For simplicity we just close the plugin and clear storage in that case.
export function isAuthenticated() {
	return localStorage.getItem(notionBearerStorageKey) !== null;
}

let notion: Client | null = null;
if (isAuthenticated()) {
	initNotionClient();
}

export function initNotionClient() {
	const token = localStorage.getItem(notionBearerStorageKey);
	if (!token) throw new Error("Notion API token is missing");

	notion = new Client({
		fetch: async (url, fetchInit) => {
			try {
				const resp = await fetch(`${apiBaseUrl}/api/?url=${encodeURIComponent(url)}`, fetchInit);

				// If status is unauthorized, clear the token
				// And we close the plugin (for now)
				// TODO: Improve this flow in the plugin.
				if (resp.status === 401) {
					localStorage.removeItem(notionBearerStorageKey);
					await framer.closePlugin(
						"Notion Authorization Failed. Re-open the plugin to re-authorize.",
						{
							variant: "error",
						}
					);
					return resp;
				}

				return resp;
			} catch (error) {
				console.log("Notion API error", error);
				throw error;
			}
		},
		auth: token,
	});
}

/**
 * Given a Notion Database returns a list of possible fields that can be used as
 * a slug. And a suggested field id to use as a slug.
 */
export function getPossibleSlugFields(fieldConfigList: object[]) {
	const options: object[] = fieldConfigList.filter((fieldConfig) =>
		slugFieldTypes.includes(fieldConfig.property.type)
	);

	function getOrderIndex(type: NotionProperty["type"]): number {
		const index = slugFieldTypes.indexOf(type);
		return index === -1 ? slugFieldTypes.length : index;
	}

	options.sort((a, b) => getOrderIndex(a.type) - getOrderIndex(b.type));

	return options;
}

// Authorize the plugin with Notion.
export async function authorize() {
	const response = await fetch(`${apiBaseUrl}/authorize`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	});

	const { readKey, url } = await response.json();

	window.open(url, "_blank");

	let intervalId;

	const promise = new Promise<void>((resolve) => {
		// Poll for the authorization status
		intervalId = setInterval(async () => {
			const resp = await fetch(`${apiBaseUrl}/poll/?readKey=${readKey}`, {
				method: "POST",
			});

			if (resp.status === 200) {
				const tokenInfo = await resp.json();

				if (tokenInfo) {
					const { access_token } = tokenInfo;

					clearInterval(intervalId);
					localStorage.setItem(notionBearerStorageKey, access_token);
					initNotionClient();
				}

				resolve();
			}
		}, 2500);
	});

	return { promise, cancel: () => clearInterval(intervalId) };
}

/**
 * Given a Notion Database Properties object returns a CollectionField object
 * That maps the Notion Property to the Framer CMS collection property type
 */
export function getCollectionFieldForProperty(
	property: NotionProperty,
	name: string,
	type: string,
	fieldSettings: Record<string, any>
): CollectionField | null {
	const fieldData = {};

	if (type == "enum") {
		if (property.type == "select" || property.type == "multi_select") {
			fieldData.cases = [
				{
					id: noneOptionID,
					name: fieldSettings?.noneOption ?? "None",
				},
				...property[property.type].options.map((option) => ({
					id: option.id,
					name: option.name,
				})),
			];
		} else if (property.type == "status") {
			fieldData.cases = property.status.options.map((option) => ({
				id: option.id,
				name: option.name,
			}));
		}
	} else if (type === "file") {
		fieldData.allowedFileTypes = []; // TODO: Make this automatic based on the file types in the database
	}

	return {
		type: type,
		id: property.id,
		name,
		...fieldData,
	};
}

export function richTextToPlainText(richText: RichTextItemResponse[]) {
	return richText.map((value) => value.plain_text).join("");
}

export function getPropertyValue(
	property: PageObjectResponse["properties"][string],
	fieldType: string,
	fieldSettings: Record<string, any>
): unknown | undefined {
	const value = property[property.type];

	fieldSettings = fieldSettings || {};

	const importArray = fieldSettings[FieldSettings.MultipleFields] !== false;

	switch (property.type) {
		case "checkbox":
		case "url":
		case "number":
		case "phone_number":
		case "email":
			return value;
		case "created_time":
		case "last_edited_time":
			return dateValue(value, fieldSettings);
		case "title":
			return richTextToPlainText(value);
		case "rich_text":
			if (fieldType === "formattedText") {
				switch (fieldSettings[FieldSettings.ImportDefaultMarkdownOrHTML]) {
					case "default":
						const text = richTextToHTML(value);
						return text ? `<p>${richTextToHTML(value)}</p>` : null;
					case "html":
						return richTextToPlainText(value);
					case "markdown":
						return markdownToHTML(richTextToPlainText(value));
				}
			}
			return richTextToPlainText(value);
		case "created_by":
		case "last_edited_by":
			return value?.id;
		case "multi_select":
			if (importArray) {
				return value?.map((option) => (fieldType === "enum" ? option.id : option.name));
			} else {
				return value?.[0] ? (fieldType === "enum" ? value[0].id : value[0].name) : null;
			}
		case "people":
			return value?.map((person) => person.id).join(", ");
		case "formula":
			if (!value) {
				return null;
			}

			switch (fieldType) {
				case "string":
				case "link":
				case "image":
					return String(value[value.type] ?? "");
				case "number":
					return Number(value[value.type] ?? 0);
				case "date":
					return value.type == "date" ? dateValue(value.date, fieldSettings) : null;
				case "boolean":
					return value.type == "boolean" ? value.boolean : !!value;
				default:
					return null;
			}
		case "rollup":
			switch (value?.type) {
				case "array":
					const item = value.array[0];
					return item ? getPropertyValue(item, fieldType, fieldSettings) : null;
				case "number":
					return value.number;
				case "date":
					return dateValue(value.date, fieldSettings);
				default:
					return null;
			}
		case "date":
			return dateValue(value?.start, fieldSettings);
		case "files":
			if (importArray) {
				return value?.map((file) => file[file.type].url ?? "");
			} else {
				return value?.[0] ? (value[0][value[0].type]?.url ?? "") : "";
			}
		case "select":
			return fieldType == "enum" ? (value ? value.id : noneOptionID) : value?.name;
		case "status":
			return fieldType == "enum" ? value?.id : value?.name;
		case "unique_id":
			return fieldType == "string"
				? value.prefix
					? `${value.prefix}-${value.number}`
					: String(value.number)
				: value.number;
	}

	return null;
}

export interface SynchronizeMutationOptions {
	fields: CollectionField[];
	disabledFieldIds: string[];
	lastSyncedTime: string | null;
	slugFieldId: string;
}

export interface ItemResult {
	url: string;
	fieldId?: string;
	message: string;
}

interface SyncStatus {
	errors: ItemResult[];
	warnings: ItemResult[];
	info: ItemResult[];
}

export interface SynchronizeResult extends SyncStatus {
	status: "success" | "completed_with_errors";
}

async function getPageBlocksAsRichText(pageId: string) {
	assert(notion, "Notion client is not initialized");

	const blocks = await collectPaginatedAPI(notion.blocks.children.list, {
		block_id: pageId,
	});

	assert(blocks.every(isFullBlock), "Response is not a full block");

	return blocksToHtml(blocks);
}

async function processItem(
	item: PageObjectResponse,
	fieldsById: FieldsById,
	slugFieldId: string,
	status: SyncStatus,
	unsyncedItemIds: Set<string>,
	lastSyncedTime: string | null,
	fieldSettings: Record<string, any>
): Promise<CollectionItem | null> {
	let slugValue: null | string = null;

	const fieldData: Record<string, unknown> = {};

	// Mark the item as seen
	unsyncedItemIds.delete(item.id);

	assert(isFullPage(item));

	for (const key in item.properties) {
		const property = item.properties[key];
		if (property.id === slugFieldId) {
			const resolvedSlug = getPropertyValue(property, "string", {});
			if (resolvedSlug && typeof resolvedSlug === "string") {
				slugValue = resolvedSlug;
			}
		}
	}

	// Check if we should skip page content import
	const shouldSkipPageContent = isUnchangedSinceLastSync(item.last_edited_time, lastSyncedTime);

	if (shouldSkipPageContent) {
		status.info.push({
			message: `Skipping page content import. last updated: ${formatDate(
				item.last_edited_time
			)}, last synced: ${formatDate(lastSyncedTime!)}`,
			url: item.url,
		});
	}

	for (const key in item.properties) {
		const property = item.properties[key];
		assert(property);

		const field = fieldsById.get(property.id);

		// We can continue if the property was not included in the field mapping
		if (!field) {
			continue;
		}

		const fieldValue = getPropertyValue(property, field.type, fieldSettings[property.id]);
		if (fieldValue === null || fieldValue === undefined) {
			continue;
		}

		fieldData[field.id] = fieldValue;
	}

	if (fieldsById.has(pageContentField.id) && item.id && !shouldSkipPageContent) {
		const contentHTML = await getPageBlocksAsRichText(item.id);
		fieldData[pageContentField.id] = contentHTML;
	}

	if (fieldsById.has("page-cover") && item.cover && item.cover.type === "external") {
		fieldData["page-cover"] = item.cover.external.url;
	}

	if (fieldsById.has("page-icon") && item.icon) {
		const iconFieldType = fieldsById.get("page-icon")?.type;

		let value: string | null = null;
		if (iconFieldType === "string") {
			if (item.icon.type === "emoji") {
				value = item.icon.emoji;
			}
		} else if (iconFieldType === "image") {
			if (item.icon.type === "external") {
				value = item.icon.external.url;
			} else if (item.icon.type === "file") {
				value = item.icon.file.url;
			}
		}

		if (value) {
			fieldData["page-icon"] = value;
		}
	}

	if (!slugValue) {
		status.warnings.push({
			url: item.url,
			message: "Slug property is missing. Skipping item.",
		});
		return null;
	}

	return {
		id: item.id,
		fieldData,
		slug: slugValue,
	};
}

type FieldsById = Map<FieldId, CollectionField>;

// Function to process all items concurrently with a limit
async function processAllItems(
	data: PageObjectResponse[],
	fieldsByKey: FieldsById,
	slugFieldId: string,
	unsyncedItemIds: Set<FieldId>,
	lastSyncedDate: string | null,
	fieldSettings: Record<string, object>
) {
	const limit = pLimit(concurrencyLimit);
	const status: SyncStatus = {
		errors: [],
		info: [],
		warnings: [],
	};
	const promises = data.map((item) =>
		limit(() =>
			processItem(
				item,
				fieldsByKey,
				slugFieldId,
				status,
				unsyncedItemIds,
				lastSyncedDate,
				fieldSettings
			)
		)
	);
	const results = await Promise.all(promises);

	const collectionItems = results.filter(isDefined);

	return {
		collectionItems,
		status,
	};
}

export async function fetchDatabasePages(databaseId: string) {
	if (databasePagesByDatabaseId[databaseId]) {
		return databasePagesByDatabaseId[databaseId];
	}

	const data = await collectPaginatedAPI(notion.databases.query, {
		database_id: databaseId,
	});

	databasePagesByDatabaseId[databaseId] = data;
	return data;
}

export async function synchronizeDatabase(
	pluginContext: PluginContext
): Promise<SynchronizeResult> {
	const {
		integrationContext,
		collectionFields,
		disabledFieldIds,
		lastSyncedTime,
		slugFieldId,
		fieldSettings,
	} = pluginContext;
	const { database } = integrationContext;

	assert(isFullDatabase(database));
	assert(notion);

	const collection = await framer.getManagedCollection();

	const fieldsById = new Map<string, CollectionField>();
	for (const field of collectionFields) {
		fieldsById.set(field.id, field);
	}

	const unsyncedItemIds = new Set(await collection.getItemIds());

	const data = await fetchDatabasePages(database.id);

	assert(data.every(isFullPage), "Response is not a full page");

	const { collectionItems, status } = await processAllItems(
		data,
		fieldsById,
		slugFieldId,
		unsyncedItemIds,
		lastSyncedTime,
		fieldSettings
	);

	console.log("Submitting database");
	console.table(
		collectionItems.map((item) => ({ ...item, fieldData: JSON.stringify(item.fieldData) }))
	);

	try {
		const itemsToDelete = Array.from(unsyncedItemIds);
		const databaseName = richTextToPlainText(database.title);
		await updateCollection(
			pluginContext,
			collectionItems,
			itemsToDelete,
			getIntegrationData(pluginContext),
			databaseName
		);

		return {
			status: status.errors.length === 0 ? "success" : "completed_with_errors",
			errors: status.errors,
			info: status.info,
			warnings: status.warnings,
		};
	} catch (error) {
		// There is a bug where framer-plugin throws errors as Strings instead of wrapping them in an Error object.
		// This is a workaround until we land that PR.
		if (isString(error)) {
			throw new Error(error);
		}

		throw error;
	}
}

export function useSynchronizeDatabaseMutation(
	pluginContext: PluginContext,
	{
		onSuccess,
		onError,
	}: { onSuccess?: (result: SynchronizeResult) => void; onError?: (error: Error) => void } = {}
) {
	return useMutation({
		onError(error) {
			console.error("Synchronization failed", error);

			onError?.(error);
		},
		onSuccess,
		mutationFn: async (): Promise<SynchronizeResult> => {
			return synchronizeDatabase(pluginContext);
		},
	});
}

export async function updatePluginData(pluginContext: PluginContext) {
	const { databaseName } = pluginContext;
	const integrationData = getIntegrationData(pluginContext);
	await updateCollectionPluginData(pluginContext, integrationData, databaseName);
}

export function useDatabasesQuery() {
	assert(notion);
	return useQuery({
		queryKey: ["databases"],
		queryFn: async () => {
			assert(notion);
			const results = await collectPaginatedAPI(notion.search, {
				filter: {
					property: "object",
					value: "database",
				},
			});

			return results.filter(isFullDatabase);
		},
	});
}

function isPageLevelField(fieldId: string) {
	return fieldId === "page-icon" || fieldId === "page-cover" || fieldId === "page-content";
}

export function hasFieldConfigurationChanged(
	currentConfig: CollectionField[],
	integrationContext: object,
	disabledFieldIds: string[]
): boolean {
	const { database } = integrationContext;
	assert(isFullDatabase(database));

	const currentFieldsById = getFieldsById(currentConfig);
	const fields = Object.values(currentFieldsById).filter((field) => !isPageLevelField(field.id));

	const properties = Object.values(database.properties).filter(
		(property) =>
			!disabledFieldIds.includes(property.id) && propertyConversionTypes[property.type]?.length > 0
	);

	if (properties.length !== fields.length) {
		return true;
	}

	const includedProperties = properties.filter((property) =>
		currentFieldsById.hasOwnProperty(property.id)
	);

	for (const property of includedProperties) {
		const currentField = currentFieldsById[property.id];
		if (!currentField) return true;

		if (!propertyConversionTypes[property.type].includes(currentField.type)) return true;
	}

	return false;
}

export function isUnchangedSinceLastSync(
	lastEditedTime: string,
	lastSyncedTime: string | null
): boolean {
	if (!lastSyncedTime) return false;

	const lastEdited = new Date(lastEditedTime);
	const lastSynced = new Date(lastSyncedTime);
	// Last edited time is rounded to the nearest minute.
	// So we should round lastSyncedTime to the nearest minute as well.
	lastSynced.setSeconds(0, 0);

	return lastSynced > lastEdited;
}

export function getFieldConversionTypes(property: NotionProperty) {
	return propertyConversionTypes[property.type] || [];
}

function dateValue(value: string, fieldSettings: Record<string, any>) {
	if (!value) {
		return null;
	}

	return !fieldSettings.time ? removeTimeFromISO(value) : value;
}

function getIntegrationData(pluginContext: PluginContext) {
	const { integrationContext } = pluginContext;
	const { database } = integrationContext;

	return { databaseId: database.id };
}
