import { assert } from "../utils";
import {
	SynchronizeMutationOptions,
	getCollectionFieldForProperty,
	getPossibleSlugFields,
	getPropertyConversionTypes,
	getEffectivePropertyType,
	updatePluginData,
	fetchTableRecords,
	autoCalculatedFieldTypes,
} from "./airtable";
import { PluginContext, usePluginContext } from "../general/PluginContext";
import { cmsFieldTypeNames, imageFileMimeTypes } from "../general/data";
import { MapFieldsPageTemplate, CollectionFieldConfig } from "../general/MapFieldsTemplate";
import { FieldSettings } from "../general/FieldSettings";
import { getFieldsById } from "../general/updateCollection";
import { useState, useEffect } from "react";

const propertyTypeNames = {
	aiText: "AI Text",
	multipleAttachments: "Attachments",
	autoNumber: "Auto number",
	barcode: "Barcode",
	button: "Button",
	checkbox: "Checkbox",
	singleCollaborator: "User",
	count: "Count",
	createdBy: "Created by",
	createdTime: "Created time",
	currency: "Currency",
	date: "Date",
	dateTime: "Date and time",
	duration: "Duration",
	email: "Email",
	formula: "Formula",
	lastModifiedBy: "Last modified by",
	lastModifiedTime: "Last modified time",
	multipleRecordLinks: "Link to another record",
	multilineText: "Long text",
	multipleLookupValues: "Lookup",
	multipleCollaborators: "Multiple users",
	multipleSelects: "Multiple select",
	number: "Number",
	percent: "Percent",
	phoneNumber: "Phone",
	rating: "Rating",
	richText: "Rich text",
	rollup: "Rollup",
	singleLineText: "Text",
	singleSelect: "Single select",
	externalSyncSource: "Sync source",
	url: "URL",
};

const allFieldSettings = [
	{ propertyType: "createdTime", [FieldSettings.Time]: true },
	{ propertyType: "dateTime", [FieldSettings.Time]: true },
	{ propertyType: "lastModifiedTime", [FieldSettings.Time]: true },
	{ propertyType: "formula", fieldType: "date", [FieldSettings.Time]: true },
	{
		propertyType: "multipleAttachments",
		[FieldSettings.MultipleFields]: {
			true: "The attachments will be imported as multiple CMS fields with a number ending added to each field's name.",
			false:
				"Only the first attachment will be imported as a CMS field, and the rest will be ignored.",
		},
	},
	{
		propertyType: "multipleLookupValues",
		[FieldSettings.MultipleFields]: {
			true: "The lookup values will be imported as multiple CMS fields with a number ending added to each field's name.",
			false:
				"Only the first lookup value will be imported as a CMS field, and the rest will be ignored.",
		},
	},
	{
		propertyType: "multipleCollaborators",
		[FieldSettings.MultipleFields]: {
			true: "The collaborators' names will be imported as multiple CMS fields with a number ending added to each field's name.",
			false:
				"Only the first collaborator's name will be imported as a CMS field, and the rest will be ignored.",
		},
	},
	{
		propertyType: "multipleSelects",
		[FieldSettings.MultipleFields]: {
			true: "The multi-select options will be imported as multiple CMS fields with a number ending added to each field's name.",
			false: "Only the first option will be imported as a CMS field, and the rest will be ignored.",
		},
	},
	{
		propertyType: "singleSelect",
		fieldType: "enum",
		[FieldSettings.NoneOption]: true,
	},
	{
		propertyType: "multipleSelects",
		fieldType: "enum",
		[FieldSettings.NoneOption]: true,
	},
	{
		propertyType: "singleLineText",
		fieldType: "formattedText",
		[FieldSettings.ImportMarkdownOrHTML]: true,
	},
	{
		propertyType: "multilineText",
		fieldType: "formattedText",
		[FieldSettings.ImportMarkdownOrHTML]: true,
	},
	{
		propertyType: "aiText",
		fieldType: "formattedText",
		[FieldSettings.ImportMarkdownOrHTML]: true,
	},
];

function sortField(fieldA: CollectionFieldConfig, fieldB: CollectionFieldConfig): number {
	// Sort unsupported fields to bottom
	if (!fieldA.field && !fieldB.field) {
		return 0;
	} else if (!fieldA.field) {
		return 1;
	} else if (!fieldB.field) {
		return -1;
	}

	return -1;
}

async function createFieldConfig(pluginContext: PluginContext): Promise<CollectionFieldConfig[]> {
	const { integrationContext, disabledFieldIds } = pluginContext;
	const { table } = integrationContext;

	if (!table) {
		return [];
	}

	const result: CollectionFieldConfig[] = [];

	const canHaveNewFields = pluginContext.type === "update";
	const existingFieldsById = canHaveNewFields ? getFieldsById(pluginContext.collectionFields) : {};
	const autoFieldTypesById = {};

	const tableRecords = await fetchTableRecords(
		integrationContext.baseId,
		integrationContext.tableId
	);

	const autoFileTypeFieldIds: string[] = [];

	for (const property of table.fields) {
		if (getEffectivePropertyType(property) == "multipleAttachments") {
			autoFileTypeFieldIds.push(property.id);
		}
	}

	const fileTypesByPropertyId = {};

	for (const record of tableRecords) {
		if (!record || !record.fields) {
			continue;
		}

		for (const fieldId of autoFileTypeFieldIds) {
			const files = record.fields[fieldId];

			if (!Array.isArray(files) || !files.length) {
				continue;
			}

			if (!fileTypesByPropertyId[fieldId]) {
				fileTypesByPropertyId[fieldId] = [];
			}

			for (const file of files) {
				if (file.type) {
					fileTypesByPropertyId[fieldId].push(file.type);
				}
			}
		}
	}

	for (const propertyId of Object.keys(fileTypesByPropertyId)) {
		const fileTypes = fileTypesByPropertyId[propertyId];
		if (!fileTypes.length) {
			continue;
		}

		let isImage = true;
		for (const fileType of fileTypes) {
			if (!imageFileMimeTypes.includes(fileType)) {
				isImage = false;
				break;
			}
		}

		autoFieldTypesById[propertyId] = isImage ? "image" : "file";
	}

	for (const key in table.fields) {
		const property = table.fields[key];
		assert(property);

		const conversionTypes = getPropertyConversionTypes(property) ?? [];

		result.push({
			originalFieldName: property.name,
			isNewField: canHaveNewFields
				? !existingFieldsById.hasOwnProperty(property.id) && !disabledFieldIds.includes(property.id)
				: false,
			unsupported: !conversionTypes.length,
			property,
			conversionTypes,
			isPageLevelField: false,
			autoFieldType: autoFieldTypesById[property.id],
			effectiveType: getEffectivePropertyType(property),
		});
	}

	return result.sort(sortField);
}

function getInitialSlugFieldId(context: PluginContext, fieldOptions): string | null {
	if (context.type === "update" && context.slugFieldId) return context.slugFieldId;

	return fieldOptions[0]?.id ?? null;
}

function getPropertyTypeName(fieldConfig: CollectionFieldConfig, long: boolean = false) {
	const name = propertyTypeNames[fieldConfig.property.type];
	if (autoCalculatedFieldTypes.includes(fieldConfig.property.type) && long) {
		return `${name} (${propertyTypeNames[fieldConfig.effectiveType]})`;
	}

	return name;
}

export function MapFieldsPage({
	onSubmit,
	isLoading,
	error,
}: {
	onSubmit: (options: SynchronizeMutationOptions) => void;
	isLoading: boolean;
	error: Error | null;
}) {
	const { pluginContext } = usePluginContext();

	const [fieldConfig, setFieldConfig] = useState<CollectionFieldConfig[] | null>(null);

	const { table, tableId, baseId } = pluginContext.integrationContext;

	useEffect(() => {
		createFieldConfig(pluginContext).then(setFieldConfig);
	}, [pluginContext]);

	assert(table);

	return (
		<MapFieldsPageTemplate
			onSubmit={onSubmit}
			isLoading={isLoading}
			error={error}
			updatePluginData={updatePluginData}
			getPossibleSlugFields={getPossibleSlugFields}
			getInitialSlugFieldId={getInitialSlugFieldId}
			fieldConfigList={fieldConfig}
			propertyLabelText="Airtable field"
			slugFieldTitleText="Slug Field"
			databaseName={table.name}
			databaseUrl={`https://airtable.com/${baseId}/${tableId}`}
			getFieldConversionMessage={getFieldConversionMessage}
			getPropertyTypeName={getPropertyTypeName}
			allFieldSettings={allFieldSettings}
			getCollectionFieldForProperty={getCollectionFieldForProperty}
			databaseLabel="Airtable table"
		/>
	);
}

function getFieldConversionMessage(fieldConfig: CollectionFieldConfig, fieldType: string) {
	let text = "";
	let title = fieldConfig.unsupported
		? `${propertyTypeNames[fieldConfig.property.type]} is not supported`
		: `${propertyTypeNames[fieldConfig.property.type]} → ${cmsFieldTypeNames[fieldType]}`;

	switch (fieldConfig.property.type) {
		case "singleCollaborator":
		case "multipleCollaborators":
			if (fieldType === "string") {
				text =
					"Users' names are imported as text. Other user information, including email addresses and profile pictures, are not imported.";
			}
			break;
		case "button":
			if (fieldType === "link") {
				text = `If the button's action is "Open URL", the button URL will be imported as a link. Otherwise, nothing will be imported.`;
			}
			break;
		case "multipleRecordLinks":
			text = "Links to other records cannot be imported. Use Lookup fields instead.";
			break;
		case "rollup":
		case "multipleLookupValues":
		case "formula":
			if (fieldConfig.effectiveType === "richText") {
				title = `${propertyTypeNames[fieldConfig.property.type]} (${
					propertyTypeNames[fieldConfig.effectiveType]
				}) is not supported`;
				text = `Due to a limitation in Airtable's API, ${
					propertyTypeNames[fieldConfig.property.type]
				} fields containing rich text cannot be imported into Framer.`;
			}
			break;
	}

	return text ? { title, text } : null;
}
