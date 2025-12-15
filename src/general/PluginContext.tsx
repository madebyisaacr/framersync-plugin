import { ManagedCollection, CollectionField } from "framer-plugin";
import { createContext, useContext, useState } from "react";

export enum Integration {
	Airtable = "airtable",
	Notion = "notion",
	GoogleSheets = "google-sheets",
}

export interface PluginContextNew {
	type: "new";
	collection: ManagedCollection;
	authenticatedIntegrations: Integration[];
	integrationId: Integration | null;
}

export interface PluginContextUpdate {
	type: "update";
	integrationId: Integration;
	integrationContext: object;
	collection: ManagedCollection;
	collectionFields: CollectionField[];
	lastSyncedTime: string;
	hasChangedFields: boolean;
	disabledFieldIds: string[];
	slugFieldId: string | null;
	databaseName: string;
	authenticatedIntegrations: Integration[];
	fieldSettings: Record<string, object>;
}

export interface PluginContextError {
	type: "error";
	message: string;
	authenticatedIntegrations: Integration[];
}

export type PluginContext = PluginContextNew | PluginContextUpdate | PluginContextError;

const PluginContextContext = createContext(null);

export function usePluginContext() {
	return useContext(PluginContextContext);
}

export function PluginContextProvider({ children, initialContext }: { children: React.ReactNode }) {
	const [pluginContext, setPluginContext] = useState(initialContext);

	function updatePluginContext(
		newContext: Partial<PluginContext>,
		then: (pluginContext: PluginContext) => void
	) {
		let newValue = { ...pluginContext, ...newContext };
		setPluginContext(newValue);

		if (then) {
			then(newValue);
		}
	}

	return (
		<PluginContextContext.Provider value={{ pluginContext, updatePluginContext }}>
			{children}
		</PluginContextContext.Provider>
	);
}
