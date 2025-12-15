import {
	synchronizeDatabase,
	isAuthenticated,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged,
	refreshGoogleSheetsToken,
} from "./googleSheets";
import { SelectDatabasePage } from "./SelectDatabase";
import { MapFieldsPage } from "./MapFields";
import { AuthenticatePage } from "./Authenticate";

export default {
	id: "google-sheets",

	synchronizeDatabase,
	isAuthenticated,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged,
	refreshToken: refreshGoogleSheetsToken,

	AuthenticatePage,
	SelectDatabasePage,
	MapFieldsPage,

	successMessage: "Google Sheet synced successfully",
};
