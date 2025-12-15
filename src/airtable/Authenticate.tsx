import { authorize } from "./airtable";
import { AuthenticatePageTemplate } from "../general/AuthenticateTemplate";

export function AuthenticatePage({ onAuthenticated }) {
	return <AuthenticatePageTemplate
		onAuthenticated={onAuthenticated}
		authorize={authorize}
		integrationId="airtable"
		integrationName="Airtable"
		accountPlatformName="Airtable"
		databaseLabel="base"
		steps={[
			"Log in to your Airtable account",
			"Pick the base you want to import",
			"Map the base fields to the CMS",
		]}
	/>;
}
