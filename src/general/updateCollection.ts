import { framer, CollectionItem, CollectionField } from "framer-plugin";
import { slugify } from "../utils";
import { PluginContext } from "./PluginContext";
import { PluginDataKey, savePluginData } from "./pluginDataManager";

const noneOptionID = "##NONE##";

const defaultFieldValues = {
	enum: noneOptionID,
	number: 0,
	boolean: false,
	date: null,
	string: "",
	link: "",
	image: "",
	file: "",
	color: "",
	formattedText: "",
};

export async function updateCollection(
	pluginContext: PluginContext,
	collectionItems: CollectionItem[],
	itemsToDelete: string[],
	integrationData: object,
	databaseName: string | null
) {
	const { collectionFields } = pluginContext;
	const collection = await framer.getManagedCollection();

	// Generate dynamic fields (arrays and file types)
	const arrayFieldIDs = new Set<string>();
	const arrayFieldLengths = {};
	for (const item of collectionItems) {
		for (const field of collectionFields) {
			const value = item.fieldData[field.id];
			if (Array.isArray(value)) {
				arrayFieldIDs.add(field.id);
				const fieldCount = Math.min(Math.max(arrayFieldLengths[field.id] || 0, value.length), 10);
				arrayFieldLengths[field.id] = fieldCount;
			}
		}
	}

	const collectionFieldsById = getFieldsById(collectionFields);

	const replaceFieldIds = collectionFields
		.map((field) => field.id)
		.filter((fieldId) => arrayFieldIDs.has(fieldId));

	for (const item of collectionItems) {
		const fieldData = item.fieldData;
		for (const fieldId of Object.keys(fieldData)) {
			if (fieldData[fieldId] === null || fieldData[fieldId] === undefined) {
				const field = collectionFieldsById[fieldId];
				if (field) {
					fieldData[fieldId] = defaultFieldValues[field.type] ?? null;
				} else {
					fieldData[fieldId] = null;
				}
				continue;
			}

			if (replaceFieldIds.includes(fieldId)) {
				const field = collectionFieldsById[fieldId];
				const arrayFieldLength = arrayFieldLengths[fieldId];
				const value = fieldData[fieldId];

				if (!value) {
					fieldData[fieldId] = field.type == "enum" ? noneOptionID : null;
				} else if (arrayFieldLength <= 1) {
					fieldData[fieldId] =
						field.type == "enum"
							? value[0] || noneOptionID
							: (value[0] ?? defaultFieldValues[field.type] ?? null);
				} else {
					delete fieldData[fieldId];
					for (let i = 0; i < arrayFieldLength; i++) {
						const arrayValue =
							field.type == "enum"
								? value[i] || noneOptionID
								: (value[i] ?? defaultFieldValues[field.type] ?? null);
						if (arrayValue !== null && arrayValue !== undefined) {
							fieldData[`${fieldId}-[[${i}]]`] = arrayValue;
						} else {
							fieldData[`${fieldId}-[[${i}]]`] = null;
						}
					}
				}
			}
		}
	}

	let fields = collectionFields;

	if (arrayFieldIDs.size > 0) {
		fields = [];
		for (const field of collectionFields) {
			let fieldToAdd = field;

			if (arrayFieldIDs.has(field.id) && arrayFieldLengths[field.id] > 1) {
				for (let i = 0; i < arrayFieldLengths[field.id]; i++) {
					fields.push({
						...fieldToAdd,
						id: `${field.id}-[[${i}]]`,
						name: `${field.name} ${i + 1}`,
					});
				}
			} else {
				fields.push(fieldToAdd);
			}
		}
	}

	await collection.setFields(fields);
	await updateCollectionPluginData(pluginContext, integrationData, databaseName, false);

	// Handle duplicate slugs
	const existingSlugs = new Set<string>();
	for (const item of collectionItems) {
		let uniqueSlug = slugify(item.slug);

		let counter = 1;
		while (existingSlugs.has(uniqueSlug)) {
			counter++;
			uniqueSlug = `${item.slug}-${counter}`;
		}
		existingSlugs.add(uniqueSlug);

		item.slug = uniqueSlug;
	}

	if (itemsToDelete.length > 0) {
		await collection.removeItems(itemsToDelete);
	}

	await collection.addItems(collectionItems);

	collection.setPluginData(PluginDataKey.lastSyncedTime, new Date().toISOString());
}

export async function updateCollectionPluginData(
	pluginContext: PluginContext,
	integrationData: object,
	databaseName: string | null,
	shouldSetFields: boolean = true
) {
	const { collectionFields, integrationId, disabledFieldIds, slugFieldId, fieldSettings } =
		pluginContext;

	const collection = await framer.getManagedCollection();

	if (shouldSetFields) {
		await collection.setFields(collectionFields);
	}

	await savePluginData(collection, {
		[PluginDataKey.integrationId]: integrationId,
		[PluginDataKey.disabledFieldIds]: JSON.stringify(disabledFieldIds),
		[PluginDataKey.integrationData]: JSON.stringify(integrationData),
		[PluginDataKey.slugFieldId]: slugFieldId,
		[PluginDataKey.databaseName]: databaseName || pluginContext.databaseName || null,
		[PluginDataKey.fieldSettings]: fieldSettings ? JSON.stringify(fieldSettings) : null,
	});
}

export function getFieldsById(collectionFields: CollectionField[]) {
	const currentFieldsById: Record<string, CollectionField> = {};
	for (const field of collectionFields) {
		if (isArrayField(field.id)) {
			const id = getArrayFieldId(field.id);
			currentFieldsById[id] = { ...field, id, name: getBeforeLastSpace(field.name) };
		} else {
			currentFieldsById[field.id] = field;
		}
	}

	return currentFieldsById;
}

const arrayFieldPattern = /-\[\[\d+\]\]$/;

function isArrayField(fieldId: string) {
	return arrayFieldPattern.test(fieldId);
}

function getArrayFieldId(fieldId: string) {
	const lastIndex = fieldId.lastIndexOf("-[[");

	if (lastIndex === -1) {
		// If '-[[' is not found, return the original string
		return fieldId;
	}

	// Return the substring from the beginning to the last occurrence of '-[['
	return fieldId.substring(0, lastIndex);
}

function getBeforeLastSpace(str) {
	// Find the index of the last space
	const lastSpaceIndex = str.lastIndexOf(" ");

	// If there's no space, return the original string
	if (lastSpaceIndex === -1) {
		return str;
	}

	// Return the substring from the beginning to the last space
	return str.substring(0, lastSpaceIndex);
}
