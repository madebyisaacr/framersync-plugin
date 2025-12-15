import { createObject } from "../utils";

export const PluginDataKey = createObject([
	"integrationId",
	"integrationData",
	"disabledFieldIds",
	"lastSyncedTime",
	"slugFieldId",
	"databaseName",
	"fieldSettings",
	"usingStore",
]);

const PLUGIN_DATA_STORE_KEYS = [
	PluginDataKey.disabledFieldIds,
	PluginDataKey.fieldSettings,
	PluginDataKey.databaseName,
];

const apiBaseUrl =
	window.location.hostname === "localhost"
		? "http://localhost:8787"
		: "https://framersync-workers.isaac-b49.workers.dev";

export async function loadPluginData(collection, keys: string[]) {
	try {
		const promises = {};
		const fieldsToLoadFromStore = [];
		const result = {};

		const usingStore = (await collection.getPluginData(PluginDataKey.usingStore)) === "true";

		// Separate keys into store and non-store
		for (const key of keys) {
			if (usingStore && PLUGIN_DATA_STORE_KEYS.includes(key)) {
				fieldsToLoadFromStore.push(key);
			} else {
				promises[key] = collection.getPluginData(key);
			}
		}

		// Load store data first if needed
		if (fieldsToLoadFromStore.length > 0) {
			try {
				const response = await fetch(`${apiBaseUrl}/get-plugin-data?key=${collection.id}`, {
					method: "GET",
				});
				if (!response.ok) {
					throw new Error(`Failed to fetch store data: ${response.statusText}`);
				}

				const data = await response.json();
				for (const key of fieldsToLoadFromStore) {
					if (key in data && data[key] !== null && data[key] !== undefined) {
						result[key] = data[key];
					} else {
						// Add to promises if not found in store data or if value is null/undefined
						promises[key] = collection.getPluginData(key);
					}
				}
			} catch (error) {
				console.error("Failed to load from store, falling back to plugin data:", error);
				// Fallback to loading from plugin data
				for (const key of fieldsToLoadFromStore) {
					promises[key] = collection.getPluginData(key);
				}
			}
		}

		// Load remaining plugin data
		const values = await Promise.all(Object.values(promises));
		const valueKeys = Object.keys(promises);

		for (let i = 0; i < valueKeys.length; i++) {
			const key = valueKeys[i];
			result[key] = values[i];
		}

		return result;
	} catch (error) {
		console.error("Error loading plugin data:", error);
		throw error;
	}
}

export async function savePluginData(collection, values: { [key: string]: string }) {
	try {
		const promises = {};
		let saveToStore = false;
		const dataToSaveToStore: { [key: string]: string } = {};
		const keysToDelete: string[] = [];

		const usingStore = (await collection.getPluginData(PluginDataKey.usingStore)) === "true";

		if (!usingStore) {
			const data = await Promise.all(
				PLUGIN_DATA_STORE_KEYS.map((key) => collection.getPluginData(key))
			);

			for (let i = 0; i < PLUGIN_DATA_STORE_KEYS.length; i++) {
				const key = PLUGIN_DATA_STORE_KEYS[i];
				keysToDelete.push(key);
				if (!values.hasOwnProperty(key)) {
					values[key] = data[i];
				}
			}
		}

		for (const key of Object.keys(values)) {
			if (PLUGIN_DATA_STORE_KEYS.includes(key)) {
				dataToSaveToStore[key] = values[key];
				saveToStore = true;
			} else {
				promises[key] = collection.setPluginData(key, values[key]);
			}
		}

		if (saveToStore) {
			try {
				const response = await fetch(`${apiBaseUrl}/set-plugin-data`, {
					method: "POST",
					body: JSON.stringify({
						key: collection.id,
						data: dataToSaveToStore,
					}),
				});

				if (!response.ok) {
					throw new Error(`Failed to save store data: ${response.statusText}`);
				}

				const data = await response.json();
				const filteredData = {};

				for (const key of Object.keys(dataToSaveToStore)) {
					if (data[key] !== undefined) {
						filteredData[key] = data[key];
					}
				}

				if (keysToDelete.length > 0) {
					await Promise.all(keysToDelete.map((key) => collection.setPluginData(key, null)));
				}

				// Set usingStore to true only if store save was successful
				if (!usingStore) {
					await collection.setPluginData(PluginDataKey.usingStore, "true");
				}
			} catch (storeError) {
				console.error("Failed to save to store, falling back to plugin data:", storeError);

				// Save all store data to plugin data as fallback
				await Promise.all([
					...Object.entries(dataToSaveToStore).map(([key, value]) =>
						collection.setPluginData(key, value)
					),
					usingStore ? collection.setPluginData(PluginDataKey.usingStore, null) : undefined,
				]);
			}
		}

		// Save non-store data
		await Promise.all(Object.values(promises));
	} catch (error) {
		console.error("Error saving plugin data:", error);
		throw error;
	}
}
