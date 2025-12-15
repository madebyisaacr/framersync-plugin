import {
	synchronizeDatabase,
	isAuthenticated,
	refreshAirtableToken,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged
} from "./airtable";
import { SelectDatabasePage } from "./SelectDatabase";
import { MapFieldsPage } from "./MapFields";
import { AuthenticatePage } from "./Authenticate";

export default {
	id: "airtable",

	synchronizeDatabase,
	isAuthenticated,
	refreshToken: refreshAirtableToken,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged,

	AuthenticatePage,
	SelectDatabasePage,
	MapFieldsPage,

	successMessage: "Airtable table synced successfully",
};
