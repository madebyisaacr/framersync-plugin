import {
	synchronizeDatabase,
	isAuthenticated,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged,
} from "./notion";
import { SelectDatabasePage } from "./SelectDatabase";
import { MapFieldsPage } from "./MapFields";
import { AuthenticatePage } from "./Authenticate";

export default {
	id: "notion",

	synchronizeDatabase,
	isAuthenticated,
	getIntegrationContext,
	useSynchronizeDatabaseMutation,
	hasFieldConfigurationChanged,

	AuthenticatePage,
	SelectDatabasePage,
	MapFieldsPage,

	successMessage: "Notion database synced successfully",
};
