import pLimit from "p-limit";
import { assert, isDefined, isString } from "../utils";
import { CollectionField, CollectionItem, framer } from "framer-plugin";
import { useMutation } from "@tanstack/react-query";
import { PluginContext } from "../general/PluginContext";
import { updateCollection, updateCollectionPluginData } from "../general/updateCollection";
import { FieldSettings } from "../general/FieldSettings";
import { markdownToHTML } from "../general/markdownToHTML";
import { imageFileExtensions } from "../general/data";

const apiBaseUrl =
	window.location.hostname === "localhost"
		? "http://localhost:8787/google-sheets"
		: "https://framersync-workers.isaac-b49.workers.dev/google-sheets";

let googleSheetsAccessToken: string | null = null;

// Storage for the Google Sheets API key.
const googleSheetsRefreshTokenKey = "googleSheetsRefreshToken";

const propertyConversionTypes = {
	BOOLEAN: ["boolean", "string"],
	TEXT: ["string", "formattedText", "boolean", "number", "link", "image", "file", "date"],
	FORMULA: ["string", "formattedText", "boolean", "number", "link", "image", "file", "date"],
	NUMBER: ["number", "string"],
	DATE: ["date", "string"],
	TIME: ["string"],
	DATE_TIME: ["date", "string"],
	IMAGE: ["image", "link", "file", "string"],
	HYPERLINK: ["link", "string", "image", "file"],
};

// The order in which we display slug fields
const slugFieldTypes = ["TEXT", "NUMBER", "FORMULA"];

const propertyTypes = Object.keys(propertyConversionTypes);

// Maximum number of concurrent requests to Google Sheets API
// This is to prevent rate limiting.
const concurrencyLimit = 5;

const markdownIndicatorPatterns = [
	/#{1,6}\s.+/m, // Headers
	/(\*\*|__).+?\1/, // Bold text
	/(\*|_).+?\1/, // Italic text
	/`{1,3}[^`\n]+`{1,3}/, // Inline code or code blocks
	/^\s*[-*+]\s/m, // Unordered list items
	/^\s*\d+\.\s/m, // Ordered list items
	/\[.+?\]\(.+?\)/, // Links
	/!\[.+?\]\(.+?\)/, // Images
	/^\s*([-*_]){3,}\s*$/m, // Horizontal rules
	/^>.+/m, // Blockquotes
	/^\s*```[\s\S]+?```\s*$/m, // Fenced code blocks
	/\|.+\|.+\|/, // Tables
	/~~.+?~~/, // Strikethrough
];

export type GoogleSheetsColumn = {
	columnIndex: number;
	effectiveFormat?: {
		numberFormat?: {
			type: string;
		};
	};
	effectiveValue?: {
		boolValue?: boolean;
		numberValue?: number;
		stringValue?: string;
	};
	formattedValue?: string;
};

const googleSheetsApiBaseUrl = "https://sheets.googleapis.com/v4/spreadsheets";

const htmlTagRegex = /^<([a-z][a-z0-9]*)\b[^>]*>.*<\/([a-z][a-z0-9]*)>$/is;

export async function googleAPIFetch(url: string, method: string, body?: object) {
	const response = await fetch(`${apiBaseUrl}/api/?url=${encodeURIComponent(url)}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${googleSheetsAccessToken}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	// const data = await response.json();
	return response;
}

export async function getIntegrationContext(integrationData: object, databaseName: string) {
	const { spreadsheetId, sheetId } = integrationData;

	if (!spreadsheetId || sheetId == null || sheetId == undefined) {
		return null;
	}

	try {
		if (!googleSheetsAccessToken) throw new Error("Google Sheets API token is missing");

		// First, fetch the sheet's name using its ID
		const sheetMetadataResponse = await googleAPIFetch(
			`${googleSheetsApiBaseUrl}/${spreadsheetId}?fields=properties.title,sheets.properties`,
			"GET"
		);

		if (!sheetMetadataResponse.ok) {
			throw new Error(`HTTP error! status: ${sheetMetadataResponse.status}`);
		}

		const sheetMetadata = await sheetMetadataResponse.json();
		const sheet = sheetMetadata.sheets.find(
			(s) => s.properties.sheetId.toString() === sheetId.toString()
		);

		if (!sheet) {
			return Error(
				`The sheet "${databaseName}" was not found. Log in with Google and select the Sheet to sync.`
			);
		}

		const sheetTitle = sheet.properties.title;

		// Now use the sheet's title to fetch the data
		const response = await googleAPIFetch(
			`${googleSheetsApiBaseUrl}/${spreadsheetId}?ranges=${encodeURIComponent(
				sheetTitle
			)}&includeGridData=true&fields=sheets(properties,data)`,
			"GET"
		);

		if (!response.ok) {
			if (response.status === 404) {
				return Error(
					`The sheet "${sheetTitle}" was not found. Log in with Google and select the Sheet to sync.`
				);
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();

		return {
			sheet: data.sheets[0],
			spreadsheetId,
			sheetId,
			spreadsheet: {
				id: spreadsheetId,
				name: sheetMetadata.properties.title,
			},
		};
	} catch (error) {
		console.error("Error getting integration context: ", error);
		return null;
	}
}

// Naive implementation to be authenticated, a token could be expired.
// For simplicity we just close the plugin and clear storage in that case.
export function isAuthenticated() {
	return localStorage.getItem(googleSheetsRefreshTokenKey) !== null;
}

// TODO: Check if refresh token is expired
export async function refreshGoogleSheetsToken() {
	// Do not refresh if we already have an access token
	if (googleSheetsAccessToken) {
		return true;
	}

	try {
		const refreshToken = localStorage.getItem(googleSheetsRefreshTokenKey);

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
		const { access_token } = responseJson;

		googleSheetsAccessToken = access_token;
		return true;
	} catch (error) {
		localStorage.removeItem(googleSheetsRefreshTokenKey);
		console.error("Failed to refresh Google Sheets token", error);
		return false;
	}
}

/**
 * Given a Google Sheets worksheet returns a list of possible fields that can be used as
 * a slug. And a suggested field id to use as a slug.
 */
export function getPossibleSlugFields(fieldConfigList: object[]) {
	const options: object[] = fieldConfigList.filter((fieldConfig) =>
		slugFieldTypes.includes(fieldConfig.property.type)
	);

	function getOrderIndex(type: string): number {
		const index = slugFieldTypes.indexOf(type);
		return index === -1 ? slugFieldTypes.length : index;
	}

	options.sort((a, b) => getOrderIndex(a.type) - getOrderIndex(b.type));

	return options;
}

// Authorize the plugin with Google Sheets.
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
					const { access_token, refresh_token } = tokenInfo;

					clearInterval(intervalId);
					googleSheetsAccessToken = access_token;
					if (refresh_token) {
						localStorage.setItem(googleSheetsRefreshTokenKey, refresh_token);
					}
				}

				resolve();
			}
		}, 2500);
	});

	return { promise, cancel: () => clearInterval(intervalId) };
}

/**
 * Given a Google Sheets column returns a CollectionField object
 * That maps the Google Sheets column to the Framer CMS collection property type
 */
export function getCollectionFieldForProperty(
	property: object,
	name: string,
	type: string,
	fieldSettings: Record<string, any>
): CollectionField | null {
	return {
		type: type,
		id: property.id,
		name,
	};
}

export function getCellValue(
	cell: GoogleSheetsColumn,
	fieldType: string,
	fieldSettings: Record<string, any>
): unknown {
	if (!cell) {
		return getFieldTypeValue(fieldType);
	}

	const cellValue = cell.effectiveValue;
	const formattedValue = cell.formattedValue;
	const numberFormat = cell.effectiveFormat?.numberFormat?.type;

	let value: any = null;

	if (cellValue?.boolValue !== undefined) {
		value = fieldType === "boolean" ? cellValue.boolValue : String(cellValue.boolValue);
	} else if (cellValue?.numberValue !== undefined) {
		if (numberFormat === "DATE" || numberFormat === "DATE_TIME") {
			// Convert Excel date serial number to JavaScript Date
			const date = new Date((cellValue.numberValue - 25569) * 86400 * 1000);
			value = date.toISOString();
		} else if (numberFormat === "TIME") {
			// Convert Excel time serial number to formatted time string
			const totalSeconds = cellValue.numberValue * 86400;
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			const seconds = Math.floor(totalSeconds % 60);
			value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;
		} else {
			value = fieldType === "number" ? cellValue.numberValue : String(cellValue.numberValue);
		}
	} else if (cellValue?.stringValue !== undefined) {
		if (fieldType === "date") {
			value = new Date(cellValue.stringValue).toISOString();
		} else {
			value = cellValue.stringValue;
		}
	} else if (formattedValue) {
		if (fieldType === "number") {
			const parsed = parseFloat(formattedValue);
			value = isNaN(parsed) ? 0 : parsed;
		} else if (fieldType === "boolean") {
			value = formattedValue.toLowerCase() === "true" || formattedValue.toLowerCase() === "yes";
		} else if (fieldType === "date") {
			value = new Date(formattedValue).toISOString();
		} else {
			value = formattedValue;
		}
	}

	// Handle image type
	const formulaValue = cell.effectiveValue?.formulaValue;
	if (
		formulaValue?.startsWith("=IMAGE(") &&
		formulaValue?.endsWith(")") &&
		propertyConversionTypes.IMAGE.includes(fieldType)
	) {
		const imageUrl = formulaValue.match(/=IMAGE\("(.+)"\)/)?.[1];
		if (imageUrl) {
			value = imageUrl;
		}
	}

	// Handle hyperlink type
	if (propertyConversionTypes.HYPERLINK.includes(fieldType)) {
		if (cell.hyperlink) {
			value = cell.hyperlink;
		} else if (cell.textFormatRuns && cell.textFormatRuns.some((run) => run.format.link)) {
			const linkRun = cell.textFormatRuns.find((run) => run.format.link);
			if (linkRun) {
				value = linkRun.format.link.uri;
			}
		}
	}

	if (value !== null && value !== undefined) {
		if (fieldType === "formattedText") {
			const format = fieldSettings[FieldSettings.ImportMarkdownOrHTML] || "html";
			return format === "markdown" ? markdownToHTML(value) : value;
		}

		if (fieldType === "link") {
			try {
				new URL(value);
				return value;
			} catch {
				return null;
			}
		}

		return value;
	}

	// Default values based on field type
	return getFieldTypeValue(fieldType);
}

export interface SynchronizeMutationOptions {
	fields: CollectionField[];
	disabledFieldIds: string[];
	lastSyncedTime: string | null;
	slugFieldId: string;
}

export interface ItemResult {
	rowIndex: number;
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

async function processItem(
	row: { values: GoogleSheetsColumn[] },
	rowIndex: number,
	fieldsById: FieldsById,
	slugFieldId: string,
	status: SyncStatus,
	unsyncedItemIds: Set<string>,
	lastSyncedTime: string | null,
	fieldSettings: Record<string, any>,
	headerRow: GoogleSheetsColumn[]
): Promise<CollectionItem | null> {
	let slugValue: null | string = null;

	const fieldData: Record<string, unknown> = {};

	// Mark the item as seen
	unsyncedItemIds.delete(rowIndex.toString());

	row.values.forEach((cell, index) => {
		const columnId = generateColumnId(headerRow[index]?.formattedValue);
		if (columnId === slugFieldId) {
			const resolvedSlug = getCellValue(cell, "string", {});
			if (!resolvedSlug || typeof resolvedSlug !== "string") {
				return;
			}
			slugValue = resolvedSlug;
		}

		const field = fieldsById.get(columnId);

		// We can continue if the column was not included in the field mapping
		if (!field || !field.id) {
			return;
		}

		let fieldValue = getCellValue(cell, field.type, fieldSettings[field.id]);
		const noValue = fieldValue === null || fieldValue === undefined;

		if (field.type === "string") {
			fieldValue = noValue ? "" : String(fieldValue);
		} else if (field.type === "number") {
			fieldValue = noValue ? 0 : Number(fieldValue);
		} else if (field.type === "boolean") {
			fieldValue = noValue ? false : Boolean(fieldValue);
		} else if (field.type === "link" || field.type === "image" || field.type === "file") {
			if (typeof fieldValue === "string" && isValidUrl(fieldValue)) {
				fieldValue = fieldValue;
			} else {
				fieldValue = null;
			}
		}

		fieldData[field.id] = fieldValue;
	});

	if (!slugValue) {
		status.warnings.push({
			rowIndex,
			message: "Slug property is missing. Skipping item.",
		});
		return null;
	}

	return {
		id: rowIndex.toString(),
		fieldData,
		slug: slugValue,
	};
}

type FieldsById = Map<string, CollectionField>;

// Function to process all items concurrently with a limit
async function processAllItems(
	data: { values: GoogleSheetsColumn[] }[],
	fieldsByKey: FieldsById,
	slugFieldId: string,
	unsyncedItemIds: Set<string>,
	lastSyncedDate: string | null,
	fieldSettings: Record<string, any>,
	headerRow: GoogleSheetsColumn[]
) {
	const limit = pLimit(concurrencyLimit);
	const status: SyncStatus = {
		errors: [],
		info: [],
		warnings: [],
	};
	const promises = data.map((row, index) =>
		limit(() =>
			processItem(
				row,
				index,
				fieldsByKey,
				slugFieldId,
				status,
				unsyncedItemIds,
				lastSyncedDate,
				fieldSettings,
				headerRow
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
	const { sheet } = integrationContext;

	assert(sheet && sheet.data && sheet.data[0].rowData);

	const collection = await framer.getManagedCollection();

	const fieldsById = new Map<string, CollectionField>();
	for (const field of collectionFields) {
		fieldsById.set(field.id, field);
	}

	const unsyncedItemIds = new Set(await collection.getItemIds());

	const headerRow = sheet.data[0].rowData![0].values!;
	// Filter out empty rows before processing
	const data = sheet.data[0]
		.rowData!.slice(1)
		.filter(
			(row) =>
				row.values &&
				row.values.some((cell) => cell.formattedValue !== undefined && cell.formattedValue !== "")
		);

	const { collectionItems, status } = await processAllItems(
		data,
		fieldsById,
		slugFieldId,
		unsyncedItemIds,
		lastSyncedTime,
		fieldSettings,
		headerRow
	);

	console.log("Submitting sheet");
	console.table(
		collectionItems.map((item) => ({ ...item, fieldData: JSON.stringify(item.fieldData) }))
	);

	try {
		const itemsToDelete = Array.from(unsyncedItemIds);
		const sheetName = sheet.properties!.title!;
		await updateCollection(
			pluginContext,
			collectionItems,
			itemsToDelete,
			getIntegrationData(pluginContext),
			sheetName
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
	const { sheet } = integrationContext;
	assert(sheet && sheet.data && sheet.data[0].rowData);

	const fields = currentConfig;

	const currentFieldsById = new Map<string, CollectionField>();
	for (const field of fields) {
		currentFieldsById.set(field.id, field);
	}

	const headerRow = sheet.data[0].rowData[0].values;
	const properties = headerRow.filter(
		(cell) =>
			cell?.formattedValue && !disabledFieldIds.includes(generateColumnId(cell?.formattedValue))
	);

	if (properties.length !== fields.length) {
		return true;
	}

	const includedProperties = properties.filter((cell) =>
		currentFieldsById.has(generateColumnId(cell?.formattedValue))
	);

	for (let i = 0; i < includedProperties.length; i++) {
		const property = includedProperties[i];
		const currentField = currentFieldsById.get(generateColumnId(property?.formattedValue));
		if (!currentField) {
			console.log("Configuration changed: currentField not found", { index: i });
			return true;
		}

		const propertyType = property.effectiveFormat?.numberFormat?.type || "TEXT";
		if (!propertyConversionTypes[propertyType].includes(currentField.type)) {
			console.log("Configuration changed: property type mismatch", {
				propertyType,
				currentFieldType: currentField.type,
			});
			return true;
		}
	}

	return false;
}

export function getColumnLetter(index: number): string {
	let columnLetter = "";
	while (index >= 0) {
		columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
		index = Math.floor(index / 26) - 1;
	}
	return columnLetter;
}

export async function getSheetsList(spreadsheetId: string) {
	if (!googleSheetsAccessToken) throw new Error("Google Sheets API token is missing");

	try {
		const response = await googleAPIFetch(
			`${googleSheetsApiBaseUrl}/${spreadsheetId}?fields=sheets.properties(title,sheetId)`,
			"GET"
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();

		if (data.error) {
			console.error("Error fetching sheets list:", data.error);
			return [];
		}

		return data.sheets;
	} catch (error) {
		console.error("Error fetching sheets list:", error);
		throw error;
	}
}

export async function getFullSheet(spreadsheetId: string, sheetId: string) {
	const response = await googleAPIFetch(
		`${googleSheetsApiBaseUrl}/${spreadsheetId}?ranges=${sheetId}&includeGridData=true&fields=sheets(properties,data)`,
		"GET"
	);

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const data = await response.json();
	const sheet = data.sheets[0];

	if (!sheet) {
		throw new Error("Failed to fetch sheet data");
	}

	return sheet;
}

export function getColumnPropertyType(rowData: GoogleSheetsColumn[], columnIndex: number) {
	let columnType: string | null = null;
	let autoFieldType: string | undefined;
	let autoFieldSettings: Record<string, any> | undefined;
	let nonEmptyCellCount = 0;

	// First loop: Determine basic column type
	for (let i = 1; i < rowData.length; i++) {
		const cellValue = rowData[i].values[columnIndex];

		if (!cellValue) {
			continue;
		}

		const effectiveValue = cellValue.effectiveValue;
		const effectiveFormat = cellValue.effectiveFormat;

		if (!effectiveValue) {
			continue;
		}

		nonEmptyCellCount++;

		let currentCellType: string;

		if (
			effectiveFormat?.numberFormat?.type &&
			propertyTypes.includes(effectiveFormat.numberFormat.type)
		) {
			currentCellType = effectiveFormat.numberFormat.type;
		} else if (typeof effectiveValue.numberValue === "number") {
			currentCellType = "NUMBER";
		} else if (typeof effectiveValue.boolValue === "boolean") {
			currentCellType = "BOOLEAN";
		} else if (
			effectiveValue.stringValue &&
			effectiveValue.stringValue.match(/^\d{4}-\d{2}-\d{2}$/)
		) {
			currentCellType = "DATE";
		} else if (
			cellValue.hyperlink ||
			(cellValue.textFormatRuns && cellValue.textFormatRuns.some((run) => run.format.link))
		) {
			currentCellType = "HYPERLINK";
		} else if (
			effectiveValue.formulaValue &&
			effectiveValue.formulaValue.startsWith("=IMAGE(") &&
			effectiveValue.formulaValue.endsWith(")")
		) {
			currentCellType = "IMAGE";
		} else {
			currentCellType = "TEXT";
		}

		if (columnType === null) {
			columnType = currentCellType;
		} else if (columnType !== currentCellType) {
			columnType = "TEXT";
			break;
		}
	}

	columnType = columnType || "TEXT";

	// Second loop: Check for formatted text if column type is TEXT
	if (columnType === "TEXT") {
		let formattedTextCount = 0;
		let htmlCount = 0;
		let markdownCount = 0;

		for (let i = 1; i < rowData.length; i++) {
			const cellValue = rowData[i].values[columnIndex];

			if (!cellValue) {
				continue;
			}

			const effectiveValue = cellValue.effectiveValue;
			if (
				effectiveValue &&
				effectiveValue.stringValue &&
				effectiveValue.stringValue.trim() !== ""
			) {
				const trimmedString = effectiveValue.stringValue.trim();
				if (htmlTagRegex.test(trimmedString)) {
					htmlCount++;
					formattedTextCount++;
				} else if (isMarkdown(trimmedString)) {
					markdownCount++;
					formattedTextCount++;
				}
			}
		}

		if (formattedTextCount > nonEmptyCellCount / 2) {
			autoFieldType = "formattedText";
			autoFieldSettings = {
				importMarkdownOrHTML: htmlCount > markdownCount ? "html" : "markdown",
			};
		}
	} else if (columnType === "HYPERLINK") {
		let notAllImages = false;
		let imageCount = 0;

		for (let i = 1; i < rowData.length; i++) {
			const cellValue = rowData[i].values[columnIndex];

			if (!cellValue || !cellValue.effectiveValue || !cellValue.effectiveValue.stringValue) {
				continue;
			}

			const link = cellValue.effectiveValue.stringValue.trim().toLowerCase();
			const extension = link.split(".").pop();
			const isImage = imageFileExtensions.includes(extension);

			if (isImage) {
				imageCount++;
			} else {
				notAllImages = true;
				break;
			}
		}

		if (imageCount > 0 && !notAllImages) {
			autoFieldType = "image";
		}
	}

	const conversionTypes = propertyConversionTypes[columnType] || [];

	return [conversionTypes, columnType, autoFieldType, autoFieldSettings];
}

function getIntegrationData(pluginContext: PluginContext) {
	const { integrationContext } = pluginContext;
	const { spreadsheetId, sheetId } = integrationContext;
	return { spreadsheetId, sheetId };
}

function isMarkdown(text) {
	// Minimum number of Markdown indicators required
	const minIndicators = 3;

	// Count how many Markdown indicators are present
	const indicatorCount = markdownIndicatorPatterns.reduce((count, pattern) => {
		return count + (pattern.test(text) ? 1 : 0);
	}, 0);

	// Return true if the number of indicators meets or exceeds the minimum
	return indicatorCount >= minIndicators;
}

export function openGooglePicker(): string {
	const readKey =
		Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	window.open(
		`${apiBaseUrl}/open-picker?access_token=${googleSheetsAccessToken}&readKey=${readKey}`,
		"_blank"
	);

	return readKey;
}

export async function getSpreadsheetMetadata(spreadsheetId: string) {
	const response = await googleAPIFetch(
		`${googleSheetsApiBaseUrl}/${spreadsheetId}?fields=properties.title`,
		"GET"
	);

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return response.json();
}

export function generateColumnId(inputString: string | undefined): string {
	if (!inputString) {
		return "";
	}

	// Simple hash function
	let hash = 0;
	for (let i = 0; i < inputString.length; i++) {
		const char = inputString.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}

	// Convert to hexadecimal and pad to ensure 32 characters
	const hexHash = Math.abs(hash).toString(16).padStart(32, "0");
	return hexHash.slice(0, 32);
}

function getFieldTypeValue(fieldType: string) {
	switch (fieldType) {
		case "number":
			return 0;
		case "boolean":
			return false;
		case "date":
			return null;
		default:
			return "";
	}
}

// URL validation function
function isValidUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
