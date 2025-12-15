import { useState, useEffect } from "react";
import { usePluginContext, PluginContext } from "../general/PluginContext";
import { MapFieldsPageTemplate, CollectionFieldConfig } from "../general/MapFieldsTemplate";
import { getFieldsById } from "../general/updateCollection";

const rssPropertyTypes = {};

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

	const canHaveNewFields = pluginContext.type === "update";
	const existingFieldsById = canHaveNewFields ? getFieldsById(pluginContext.collectionFields) : {};

	const isNewField = (fieldId: string) => {
		return canHaveNewFields
			? !existingFieldsById.hasOwnProperty(fieldId) && !disabledFieldIds.includes(fieldId)
			: false;
	};

	const result = [];

	return result.sort(sortField);
}

function getInitialSlugFieldId(
	context: PluginContext,
	fieldOptions: NotionProperty[]
): string | null {
	if (context.type === "update" && context.slugFieldId) return context.slugFieldId;

	return fieldOptions[0]?.id ?? null;
}

export function MapFieldsPage({
	onSubmit,
	isLoading,
	error,
}: {
	onSubmit: () => void;
	isLoading: boolean;
	error: Error | null;
}) {
	const { pluginContext } = usePluginContext();
	const [fieldConfig, setFieldConfig] = useState<CollectionFieldConfig[] | null>(null);

	useEffect(() => {
		createFieldConfig(pluginContext).then(setFieldConfig);
	}, [pluginContext]);

	return (
		<MapFieldsPageTemplate
			onSubmit={onSubmit}
			isLoading={isLoading}
			error={error}
			// updatePluginData={updatePluginData}
			// getPossibleSlugFields={getPossibleSlugFields}
			getInitialSlugFieldId={getInitialSlugFieldId}
			fieldConfigList={fieldConfig}
			propertyLabelText="RSS feed property"
			slugFieldTitleText="Slug Field Property"
			// databaseName={}
			// databaseUrl={database.url}
			getFieldConversionMessage={getFieldConversionMessage}
			getPropertyTypeName={getPropertyTypeName}
			// allFieldSettings={allFieldSettings}
			// getCollectionFieldForProperty={getCollectionFieldForProperty}
			databaseLabel="RSS feed"
		/>
	);
}

function getPropertyTypeName(fieldConfig: CollectionFieldConfig) {
	return rssPropertyTypes[fieldConfig.property.type];
}

function getFieldConversionMessage(
	fieldConfig: CollectionFieldConfig,
	fieldType: string
): { title: string; text: string } | null {
	return null;
}
