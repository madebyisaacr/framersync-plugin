import pLimit from "p-limit";
import { isDefined, isString } from "../utils";
import { CollectionField, CollectionItem, framer } from "framer-plugin";
import { useMutation } from "@tanstack/react-query";
import { richTextToPlainText, richTextToHTML } from "./richText";
import { PluginContext } from "../general/PluginContext";
import {
	updateCollection,
	updateCollectionPluginData,
	getFieldsById,
} from "../general/updateCollection";
import { FieldSettings } from "../general/FieldSettings";
import { markdownToHTML } from "../general/markdownToHTML";

type FieldId = string;

const apiBaseUrl =
	window.location.hostname === "localhost"
		? "http://localhost:8787/airtable"
		: "https://framersync-workers.isaac-b49.workers.dev/airtable";

let airtableAccessToken: string | null = null;

// Storage for the Airtable API key refresh token.
const airtableRefreshTokenKey = "airtableRefreshToken";

const noneOptionID = "##NONE##";

// Maximum number of concurrent requests to Airtable API
// This is to prevent rate limiting.
// TODO: Is this necessary with Airtable?
const concurrencyLimit = 5;

const propertyConversionTypes: Record<string, string[]> = {
	aiText: ["string", "formattedText"],
	multipleAttachments: ["file", "image"],
	autoNumber: ["number"],
	barcode: ["string"],
	button: ["link"],
	checkbox: ["boolean"],
	singleCollaborator: ["string"],
	count: ["number"],
	createdBy: ["string"],
	createdTime: ["date"],
	currency: ["number", "string"],
	date: ["date"],
	dateTime: ["date"],
	duration: ["string"],
	email: ["string"],
	lastModifiedBy: ["string"],
	lastModifiedTime: ["date"],
	multilineText: ["string", "formattedText"],
	multipleCollaborators: ["string"],
	multipleSelects: ["enum", "string"],
	number: ["number"],
	percent: ["number"],
	phoneNumber: ["string"],
	rating: ["number"],
	richText: ["formattedText", "string"],
	singleLineText: ["string", "formattedText"],
	singleSelect: ["enum", "string"],
	externalSyncSource: ["string"],
	url: ["link", "string"],
	multipleRecordLinks: [],
};

export const autoCalculatedFieldTypes = ["formula", "multipleLookupValues", "rollup"];

// The order in which we display slug fields
const slugFieldTypes = ["singleLineText", "multilineText", "autoNumber", "aiText"];

const tableRecordsByTableId = {};

export async function getIntegrationContext(integrationData: object, databaseName: string) {
	const { baseId, tableId } = integrationData;

	if (!baseId || !tableId) {
		return null;
	}

	try {
		const baseSchema = await airtableFetch(`meta/bases/${baseId}/tables`);
		const table = baseSchema.tables.find((t) => t.id === tableId);

		return {
			baseId,
			tableId,
			baseSchema,
			table,
		};
	} catch (error) {
		return new Error(
			`The Airtable base "${databaseName}" was not found. Log in with Airtable and select the Base to sync.`
		);
	}
}

// Naive implementation to be authenticated, a token could be expired.
// For simplicity we just close the plugin and clear storage in that case.
// TODO: Refresh the token when it expires
export function isAuthenticated() {
	return localStorage.getItem(airtableRefreshTokenKey) !== null;
}

// TODO: Check if refresh token is expired (60 days)
export async function refreshAirtableToken() {
	// Do not refresh if we already have an access token
	if (airtableAccessToken) {
		return true;
	}

	try {
		const refreshToken = localStorage.getItem(airtableRefreshTokenKey);

		if (!refreshToken) {
			return false;
		}

		const response = await fetch(`${apiBaseUrl}/refresh/?refresh_token=${refreshToken}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});

		const responseJson = await response.json();
		const { access_token, refresh_token } = responseJson;

		airtableAccessToken = access_token;
		localStorage.setItem(airtableRefreshTokenKey, refresh_token);
		return true;
	} catch (error) {
		localStorage.removeItem(airtableRefreshTokenKey);
		console.error("Failed to refresh Airtable token", error);
		return false;
	}
}

export async function airtableFetch(url: string, body?: object) {
	const response = await fetch(`https://api.airtable.com/v0/${url}${objectToUrlParams(body)}`, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${airtableAccessToken}`,
		},
	});
	const data = await response.json();
	return data;
}

/**
 * Given an Airtable base returns a list of possible fields that can be used as
 * a slug. And a suggested field id to use as a slug.
 */
export function getPossibleSlugFields(fieldConfigList: object[]) {
	const options: object[] = fieldConfigList.filter((fieldConfig) =>
		slugFieldTypes.includes(fieldConfig.effectiveType)
	);

	function getOrderIndex(type: string): number {
		const index = slugFieldTypes.indexOf(type);
		return index === -1 ? slugFieldTypes.length : index;
	}

	options.sort((a, b) => getOrderIndex(a.effectiveType) - getOrderIndex(b.effectiveType));

	return options;
}

// Authorize the plugin with Airtable.
export async function authorize() {
	const response = await fetch(`${apiBaseUrl}/authorize/`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	});

	const { readKey, url } = await response.json();

	// Open the Airtable authorization URL in a new tab
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
					const { access_token, refresh_token } = tokenInfo;

					clearInterval(intervalId);
					airtableAccessToken = access_token;
					localStorage.setItem(airtableRefreshTokenKey, refresh_token);
				}

				resolve();
			}
		}, 2500);
	});

	return { promise, cancel: () => clearInterval(intervalId) };
}

/**
 * Given an Airtable Base field object returns a CollectionField object
 * That maps the Airtable field to the Framer CMS collection property type
 */
export function getCollectionFieldForProperty(
	property: object,
	name: string,
	type: string,
	fieldSettings: Record<string, any>
): CollectionField | null {
	if (!property || !property.id) {
		return null;
	}

	const fieldData = {};

	if (type == "enum") {
		const options = autoCalculatedFieldTypes.includes(property.type)
			? property.options?.result?.options?.choices
			: property.options?.choices;

		fieldData.cases = [
			{
				id: noneOptionID,
				name: fieldSettings?.noneOption ?? "None",
			},
			...options.map((option) => ({
				id: option.id,
				name: option.name,
			})),
		];
	} else if (type === "file") {
		fieldData.allowedFileTypes = []; // TODO: Make this automatic based on the file types in the database
	}

	return {
		type,
		id: property.id,
		name,
		...fieldData,
	};
}

export function getPropertyValue(
	property: object,
	propertyValue: any,
	fieldType: string,
	fieldSettings: Record<string, any>
): unknown | undefined {
	if (
		property === null ||
		property === undefined ||
		propertyValue === null ||
		propertyValue === undefined
	) {
		return null;
	}

	fieldSettings = fieldSettings || {};

	const importArray = fieldSettings[FieldSettings.MultipleFields];

	let values = Array.isArray(propertyValue)
		? importArray
			? propertyValue
			: [propertyValue[0]]
		: [propertyValue];

	// Handle isReversed option for multipleAttachments
	if (
		property.type === "multipleAttachments" &&
		property.options?.isReversed &&
		Array.isArray(values)
	) {
		values = [...values].reverse();
	}

	const result = values.map((value) => {
		switch (property.type) {
			case "email":
			case "autoNumber":
			case "count":
			case "checkbox":
			case "number":
			case "percent":
			case "phoneNumber":
			case "rating":
			case "url":
				return value;
			case "singleLineText":
			case "multilineText":
			case "aiText":
				const text = property.type === "aiText" ? value.value : value;
				if (fieldSettings[FieldSettings.ImportMarkdownOrHTML] === "markdown") {
					return markdownToHTML(text);
				} else {
					return text;
				}
			case "currency":
				if (fieldType === "string") {
					const { precision = 2, symbol = "" } = property.options || {};
					return `${symbol}${Number(value).toFixed(precision)}`;
				} else {
					return Number(value);
				}
			case "date":
			case "dateTime":
			case "createdTime":
			case "lastModifiedTime":
				return dateValue(value, fieldSettings);
			case "richText":
				return fieldType === "formattedText" ? richTextToHTML(value) : richTextToPlainText(value);
			case "multipleAttachments":
				return value.url || "";
			case "multipleRecordLinks":
				return null;
			case "barcode":
				return value.text || "";
			case "button":
				return value.url || null;
			case "singleCollaborator":
			case "createdBy":
			case "lastModifiedBy":
				return value.name || "";
			case "formula":
			case "multipleLookupValues":
			case "rollup":
				return getPropertyValue(property.options?.result, value, fieldType, {
					...fieldSettings,
					[FieldSettings.MultipleFields]: false,
				});
			case "multipleCollaborators":
			case "multipleSelects":
				return value ? (fieldType === "enum" ? getSelectOptionId(value, property) : value) : null;
			case "singleSelect":
				return fieldType === "enum" ? getSelectOptionId(value, property) : value;
			case "externalSyncSource":
				return value.name;
			case "duration":
				const hours = Math.floor(value / 3600);
				const minutes = Math.floor((value % 3600) / 60);
				const remainingSeconds = value % 60;
				const seconds = Math.floor(remainingSeconds).toString().padStart(2, "0");

				let result = "";
				result += hours.toString();
				result += ":" + minutes.toString().padStart(2, "0");

				// Handle seconds and milliseconds based on format
				switch (property.options?.durationFormat) {
					case "h:mm":
						break;
					case "h:mm:ss":
						result += ":" + seconds;
						break;
					case "h:mm:ss.S":
						result += ":" + seconds;
						result += "." + (remainingSeconds % 1).toFixed(1).substring(2);
						break;
					case "h:mm:ss.SS":
						result += ":" + seconds;
						result += "." + (remainingSeconds % 1).toFixed(2).substring(2);
						break;
					case "h:mm:ss.SSS":
						result += ":" + seconds;
						result += "." + (remainingSeconds % 1).toFixed(3).substring(2);
						break;
				}

				return result;
		}
	});

	return importArray ? result : result[0];
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
	status: "success" | "completed_with_errors" | "error";
}

async function processItem(
	item: object,
	tableSchema: object,
	fieldsById: FieldsById,
	slugFieldId: string,
	status: SyncStatus,
	unsyncedItemIds: Set<string>,
	lastSyncedTime: string | null,
	fieldSettings: Record<string, any>
): Promise<CollectionItem | null> {
	let slugValue: null | string = null;

	const properties = {};
	for (const field of tableSchema.fields) {
		properties[field.id] = field;
	}

	const fieldData: Record<string, unknown> = {};

	// Mark the item as seen
	unsyncedItemIds.delete(item.id);

	// First pass: Process all fields that exist in the record
	for (const fieldId in item.fields) {
		const value = item.fields[fieldId];
		const property = properties[fieldId];

		if (fieldId === slugFieldId) {
			const resolvedSlug = getPropertyValue(property, value, "string", {});
			if (typeof resolvedSlug === "string") {
				slugValue = resolvedSlug;
			} else if (Array.isArray(resolvedSlug) && typeof resolvedSlug[0] === "string") {
				slugValue = resolvedSlug[0];
			}
		}

		const field = fieldsById.get(fieldId);

		// We can continue if the property was not included in the field mapping
		if (!field) {
			continue;
		}

		const fieldValue = getPropertyValue(property, value, field.type, fieldSettings[property.id]);
		if (!fieldValue) {
			status.warnings.push({
				url: item.url,
				fieldId: field.id,
				message: `Value is missing for field ${field.name}`,
			});
			continue;
		}

		fieldData[field.id] = fieldValue;
	}

	// Second pass: Handle missing checkbox fields
	for (const [fieldId, field] of fieldsById.entries()) {
		// Skip if field already processed
		if (fieldId in fieldData) continue;

		const property = properties[fieldId];
		// If it's a checkbox field and wasn't in the record, set it to false
		if (property?.type === "checkbox") {
			fieldData[fieldId] = false;
		}
	}

	if (!slugValue) {
		status.warnings.push({
			url: item.url,
			message: "Slug is missing. Skipping item.",
		});
		return null;
	}

	return {
		id: item.id,
		fieldData,
		slug: slugValue,
	};
}

type FieldsById = Map<string, CollectionField>;

// Function to process all items concurrently with a limit
async function processAllItems(
	data: object[],
	tableSchema: object,
	fieldsById: FieldsById,
	slugFieldId: string,
	unsyncedItemIds: Set<FieldId>,
	lastSyncedDate: string | null,
	fieldSettings: Record<string, any>
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
				tableSchema,
				fieldsById,
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

export async function fetchTableRecords(baseId: string, tableId: string) {
	if (tableRecordsByTableId[tableId]) {
		return tableRecordsByTableId[tableId];
	}

	let allRecords = [];
	let offset = null;

	do {
		const params: any = {
			cellFormat: "json",
			returnFieldsByFieldId: true,
		};

		if (offset) {
			params.offset = offset;
		}

		const data = await airtableFetch(`${baseId}/${tableId}`, params);

		allRecords = allRecords.concat(data.records);
		offset = data.offset;
	} while (offset);

	tableRecordsByTableId[tableId] = allRecords;
	return allRecords;
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
		databaseName,
		fieldSettings,
	} = pluginContext;
	const { baseId, table } = integrationContext;

	if (!baseId || !table) {
		return {
			status: "error",
			errors: [],
			info: [],
			warnings: [],
		};
	}

	const collection = await framer.getManagedCollection();

	const fieldsById = new Map<string, CollectionField>();
	for (const field of collectionFields) {
		fieldsById.set(field.id, field);
	}

	const unsyncedItemIds = new Set(await collection.getItemIds());

	const records = await fetchTableRecords(baseId, table.id);

	const { collectionItems, status } = await processAllItems(
		records,
		table,
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

export function hasFieldConfigurationChanged(
	currentConfig: CollectionField[],
	integrationContext: object,
	disabledFieldIds: string[]
): boolean {
	const { table } = integrationContext;

	const currentFieldsById = getFieldsById(currentConfig);
	const fields = Object.values(currentFieldsById);

	const properties = Object.values(table.fields).filter(
		(property) =>
			!disabledFieldIds.includes(property.id) && getPropertyConversionTypes(property).length > 0
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

		if (!getPropertyConversionTypes(property).includes(currentField.type)) return true;
	}

	return false;
}

function objectToUrlParams(obj) {
	if (!obj || !Object.keys(obj).length) {
		return "";
	}

	return `?${Object.keys(obj)
		.map((key) => {
			if (obj[key] === null || obj[key] === undefined) {
				return encodeURIComponent(key);
			}
			return `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`;
		})
		.join("&")}`;
}

function dateValue(value: string, fieldSettings: Record<string, any>) {
	return !fieldSettings.time ? value?.split("T")[0] : value;
}

function getIntegrationData(pluginContext: PluginContext) {
	const { integrationContext } = pluginContext;
	const { baseId, tableId } = integrationContext;
	return { baseId, tableId };
}

function getSelectOptionId(name: string, property: object) {
	if (!name || !property) {
		return noneOptionID;
	}

	const options = autoCalculatedFieldTypes.includes(property.type)
		? property.options?.result?.options?.choices
		: property.options?.choices;

	if (options) {
		for (const option of options) {
			if (option.name === name) {
				return option.id;
			}
		}
	}

	return noneOptionID;
}

export function getEffectivePropertyType(property: object) {
	if (!property) return null;

	let effectiveType = property.type;
	if (autoCalculatedFieldTypes.includes(property.type)) {
		const type = property.options?.result?.type;
		if (type) {
			effectiveType = type;
		}
	}

	return effectiveType;
}

export function getPropertyConversionTypes(property: object) {
	const effectiveType = getEffectivePropertyType(property);

	if (autoCalculatedFieldTypes.includes(property.type) && effectiveType === "richText") {
		return [];
	}

	return propertyConversionTypes[effectiveType] || [];
}
