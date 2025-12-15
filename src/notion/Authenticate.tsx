import { authorize } from "./notion";
import { AuthenticatePageTemplate } from "../general/AuthenticateTemplate";

export function AuthenticatePage({ onAuthenticated }) {
	return <AuthenticatePageTemplate
		onAuthenticated={onAuthenticated}
		authorize={authorize}
		integrationId="notion"
		integrationName="Notion"
		accountPlatformName="Notion"
		databaseLabel="database"
		steps={[
			"Log in to your Notion account",
			"Pick the database you want to import",
			"Map the database fields to the CMS",
		]}
	/>;
}
