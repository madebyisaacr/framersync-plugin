import "./globals.css";
import "./App.css";

import { ReactNode, StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { CenteredSpinner } from "./components/CenteredSpinner";
import { PluginContext } from "./general/PluginContext";

import Airtable from "./airtable/AirtableIntegration";
import Notion from "./notion/NotionIntegration";
import GoogleSheets from "./googleSheets/GoogleSheetsIntegration";
import RSS from "./rss/RSSIntegration";

import { framer, ManagedCollection, CollectionField } from "framer-plugin";
import { logSyncResult } from "./debug";
import { ErrorBoundaryFallback } from "./components/ErrorBoundaryFallback";
import { assert, jsonStringToArray } from "./utils";
import IntegrationsPage from "./general/HomePage";
import { PluginDataKey, loadPluginData } from "./general/pluginDataManager";
import { PluginContextProvider, usePluginContext } from "./general/PluginContext";
import { LemonSqueezyProvider } from "./general/License";

export const integrations = {
	notion: Notion,
	airtable: Airtable,
	"google-sheets": GoogleSheets,
	rss: RSS,
};

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
		},
	},
});

let collection: ManagedCollection | null = null;
let collectionFields: CollectionField[] | null = null;
let collectionIntegrationId: string | null = null;
let integrationDataJson: string | null = null;
let disabledFieldIdsJson: string | null = null;
let lastSyncedTime: string | null = null;
let slugFieldId: string | null = null;
let databaseName: string | null = null;
let fieldSettingsJson: string | null = null;

async function shouldSyncImmediately(pluginContext: PluginContext): Promise<boolean> {
	if (pluginContext.type !== "update") return false;

	if (!pluginContext.integrationId) return false;
	if (!pluginContext.integrationContext) return false;
	if (!pluginContext.slugFieldId) return false;
	if (pluginContext.hasChangedFields) return false;

	return true;
}

function renderPlugin(app: ReactNode) {
	const root = document.getElementById("root");
	if (!root) throw new Error("Root element not found");

	ReactDOM.createRoot(root).render(<StrictMode>{app}</StrictMode>);
}

async function createPluginContext(selectedIntegrationId: string = ""): Promise<PluginContext> {
	const integrationId = collectionIntegrationId ?? selectedIntegrationId;
	const integration = integrations[integrationId];

	let authenticatedIntegrations = [];
	for (const integrationId of Object.keys(integrations)) {
		const integration = integrations[integrationId];
		if (integration.isAuthenticated()) {
			authenticatedIntegrations.push(integrationId);
		}
	}

	if (
		integration &&
		authenticatedIntegrations.includes(integrationId) &&
		typeof integration.refreshToken === "function"
	) {
		const success = await integration.refreshToken();
		if (!success) {
			authenticatedIntegrations = authenticatedIntegrations.filter((id) => id !== integrationId);
		}
	}

	if (!integration || !integrationDataJson) {
		return {
			type: "new",
			collection,
			authenticatedIntegrations,
			integrationId: integration ? integrationId : null,
		};
	}

	try {
		const disabledFieldIds = jsonStringToArray(disabledFieldIdsJson);
		const integrationData = JSON.parse(integrationDataJson);
		const fieldSettings = fieldSettingsJson ? JSON.parse(fieldSettingsJson) : {};

		let integrationContext: object | null = null;
		let hasChangedFields: boolean = false;
		try {
			integrationContext = await integration.getIntegrationContext(integrationData, databaseName);
			hasChangedFields = integration.hasFieldConfigurationChanged(
				collectionFields,
				integrationContext,
				disabledFieldIds
			);
		} catch (error) {
			console.error("Error getting integration context:", error);
		}

		return {
			type: "update",
			integrationId,
			integrationContext,
			collection,
			collectionFields,
			disabledFieldIds,
			lastSyncedTime,
			slugFieldId,
			databaseName,
			fieldSettings,
			hasChangedFields,
			authenticatedIntegrations,
		};
	} catch (error) {
		return {
			type: "error",
			message: "Failed to get plugin context. Please try again.",
			authenticatedIntegrations: [],
			integrationId: integration ? integrationId : null,
		};
	}
}

function AuthenticatedApp() {
	const { pluginContext } = usePluginContext();

	const integration = integrations[pluginContext.integrationId];
	if (!integration) {
		return null;
	}

	const synchronizeMutation = integration.useSynchronizeDatabaseMutation(pluginContext, {
		onSuccess(result) {
			logSyncResult(result);

			if (result.status === "success") {
				framer.closePlugin(integration.successMessage);
				return;
			}
		},
	});

	const { SelectDatabasePage, MapFieldsPage } = integration;

	if (!pluginContext.integrationContext) {
		return <SelectDatabasePage />;
	}

	return (
		<MapFieldsPage
			onSubmit={synchronizeMutation.mutate}
			error={synchronizeMutation.error}
			isLoading={synchronizeMutation.isPending}
		/>
	);
}

function App() {
	const { pluginContext, updatePluginContext } = usePluginContext();

	const handleAuthenticated = async () => {
		const authenticatedContext = await createPluginContext(pluginContext.integrationId);
		updatePluginContext(authenticatedContext);
	};

	const onIntegrationSelected = async (integrationId: string) => {
		const authenticatedContext = await createPluginContext(integrationId);
		updatePluginContext(authenticatedContext);
	};

	const integration = integrations[pluginContext.integrationId];

	if (!integration) {
		return <IntegrationsPage onIntegrationSelected={onIntegrationSelected} />;
	} else if (!pluginContext.authenticatedIntegrations.includes(pluginContext.integrationId)) {
		const { AuthenticatePage } = integration;
		return <AuthenticatePage onAuthenticated={handleAuthenticated} />;
	}

	return <AuthenticatedApp />;
}

async function runPlugin() {
	collection = await framer.getManagedCollection();
	const [fields, pluginData] = await Promise.all([
		collection.getFields(),
		loadPluginData(collection, [
			PluginDataKey.integrationId,
			PluginDataKey.integrationData,
			PluginDataKey.disabledFieldIds,
			PluginDataKey.lastSyncedTime,
			PluginDataKey.slugFieldId,
			PluginDataKey.databaseName,
			PluginDataKey.fieldSettings,
		]),
	]);

	const newCollectionFields: any[] = [];
	for (const field of fields) {
		if (field.id.includes("-[[")) {
			if (field.id.endsWith("-[[0]]")) {
				newCollectionFields.push({
					...field,
					name: field.name.substring(0, field.name.length - 2),
					id: field.id.replace("-[[0]]", ""),
				});
			}
		} else {
			newCollectionFields.push(field);
		}
	}

	collectionFields = newCollectionFields;
	collectionIntegrationId = pluginData[PluginDataKey.integrationId];
	integrationDataJson = pluginData[PluginDataKey.integrationData];
	disabledFieldIdsJson = pluginData[PluginDataKey.disabledFieldIds];
	lastSyncedTime = pluginData[PluginDataKey.lastSyncedTime];
	slugFieldId = pluginData[PluginDataKey.slugFieldId];
	databaseName = pluginData[PluginDataKey.databaseName];
	fieldSettingsJson = pluginData[PluginDataKey.fieldSettings];

	try {
		let pluginContext: PluginContext = await createPluginContext();

		const collection = await framer.getManagedCollection();
		const integration = integrations[pluginContext.integrationId];

		if (!integration) {
			pluginContext = {
				type: "new",
				collection,
				authenticatedIntegrations: pluginContext.authenticatedIntegrations,
				integrationId: null,
			};
		}

		const syncImmediately = await shouldSyncImmediately(pluginContext);
		if (framer.mode === "syncManagedCollection" && syncImmediately) {
			assert(pluginContext.slugFieldId);

			const result = await integration.synchronizeDatabase(pluginContext);

			logSyncResult(result);

			await framer.closePlugin();
			return;
		}

		renderPlugin(
			<QueryClientProvider client={queryClient}>
				<div className="flex-col items-start size-full justify-start overflow-hidden select-none">
					<ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
						<PluginContextProvider initialContext={pluginContext}>
							<LemonSqueezyProvider>
								<Suspense fallback={<CenteredSpinner />}>{<App />}</Suspense>
							</LemonSqueezyProvider>
						</PluginContextProvider>
					</ErrorBoundary>
				</div>
			</QueryClientProvider>
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		framer.closePlugin("An unexpected error ocurred: " + message, {
			variant: "error",
		});
	}
}

runPlugin();
