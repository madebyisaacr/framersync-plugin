// import {
// 	synchronizeDatabase,
// 	isAuthenticated,
// 	getIntegrationContext,
// 	useSynchronizeDatabaseMutation,
// 	hasFieldConfigurationChanged,
// } from "./rss";
// import { SelectDatabasePage } from "./SelectDatabase";
import { MapFieldsPage } from "./MapFields";
// import { AuthenticatePage } from "./Authenticate";

export default {
	id: "rss",

	// synchronizeDatabase,
	isAuthenticated: () => true,
	// getIntegrationContext,
	// useSynchronizeDatabaseMutation,
	// hasFieldConfigurationChanged,

	// AuthenticatePage,
	// SelectDatabasePage,
	MapFieldsPage,

	successMessage: "RSS feed synced successfully",
};
