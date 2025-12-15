import { richTextToPlainText, useDatabasesQuery } from "./notion";
import notionConnectSrc from "../assets/notion-connect.png";
import { usePluginContext } from "../general/PluginContext";
import SelectDatabasePageTemplate from "../general/SelectDatabaseTemplate";
import getDatabaseIcon from "./getDatabaseIcon";

export function SelectDatabasePage() {
	const { updatePluginContext } = usePluginContext();

	const { data, refetch, isRefetching, isLoading } = useDatabasesQuery();

	const onSubmit = (databaseId: string) => {
		const database = data?.find((database) => database.id === databaseId);
		if (!database) {
			return;
		}

		updatePluginContext({
			integrationContext: { database },
		});
	};

	const databases = isLoading
		? []
		: data?.map((database) => {
				return {
					id: database.id,
					title: richTextToPlainText(database.title),
					icon: getDatabaseIcon(database, 18, true),
				};
		  });

	return (
		<SelectDatabasePageTemplate
			databases={databases}
			refetch={refetch}
			isLoading={isLoading}
			isRefetching={isRefetching}
			onSubmit={onSubmit}
			title="Select a Notion database to sync"
			databasesLabel="Databases"
			instructions={
				<>
					<img src={notionConnectSrc} alt="Notion connect" className="w-full rounded" />
					<div className="flex-col gap-1">
						<p className="font-semibold text-primary">Don't see the database you're looking for?</p>
						<p>Connect another database:</p>
						<p>1. Open a database in Notion</p>
						<p>2. Click the ... button in the top-right corner</p>
						<p>3. Click Connections → Connect to → FramerSync</p>
					</div>
				</>
			}
		/>
	);
}
