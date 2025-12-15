import { authorize } from "./googleSheets";
import { AuthenticatePageTemplate } from "../general/AuthenticateTemplate";

export function AuthenticatePage({ onAuthenticated }) {
	return (
		<AuthenticatePageTemplate
			onAuthenticated={onAuthenticated}
			authorize={authorize}
			integrationId="google-sheets"
			integrationName="Google"
			accountPlatformName="Google"
			databaseLabel="sheet"
			steps={[
				"Log in to your Google account",
				"Pick the sheet you want to import",
				"Map the sheet columns to the CMS",
			]}
		/>
	);
}
