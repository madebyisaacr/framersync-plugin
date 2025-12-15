import { useState, useEffect } from "react";
import { assert } from "../utils";
import { ReloadIcon } from "../components/Icons";
import Button from "@shared/Button";
import classNames from "classnames";
import { Spinner } from "@shared/spinner/Spinner";
import Window from "./Window";
import { usePluginContext } from "./PluginContext";
import BackButton from "../components/BackButton";

interface Database {
	id: string;
	title: string;
	icon: object | null;
}

export default function SelectDatabasePageTemplate({
	databases,
	refetch,
	isLoading,
	isRefetching,
	instructions,
	title,
	onSubmit,
	connectMoreDatabases,
	subdatabases = false,
	getSubdatabases = null,
	databasesLabel = "",
	subdatabasesLabel = "",
}) {
	const { updatePluginContext } = usePluginContext();

	const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
	const [selectedSubdatabase, setSelectedSubdatabase] = useState<string | null>(null);

	const handleSubmit = () => {
		assert(databases);

		const database = databases.find((database) => database.id === selectedDatabaseId);
		if (!database) {
			setSelectedDatabaseId(null);
			return;
		}

		if (subdatabases && !selectedSubdatabase) {
			return;
		}

		onSubmit(database.id, selectedSubdatabase);
	};

	const onBackButtonClick = () => {
		updatePluginContext({
			integrationId: null,
			integrationContext: null,
		});
	};

	const nextButtonDisabled = !selectedDatabaseId || (subdatabases && !selectedSubdatabase);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Enter" && !nextButtonDisabled) {
				handleSubmit();
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [nextButtonDisabled, handleSubmit]);

	return (
		<Window
			page={instructions ? "SelectDatabaseWide" : "SelectDatabase"}
			className="flex-row overflow-hidden"
		>
			<div className="absolute top-0 inset-x-3 h-px bg-divider"></div>
			{instructions && (
				<div className="relative flex-col gap-3 p-3 w-[300px]">
					<BackButton onClick={onBackButtonClick} />
					{instructions}
					<div className="absolute right-0 inset-y-3 w-px bg-divider" />
				</div>
			)}
			<div className="flex-col flex-1 overflow-hidden">
				<div className="flex-col gap-2 flex-1 justify-between p-3 overflow-y-auto">
					{!instructions && <BackButton onClick={onBackButtonClick} />}
					<div className="flex items-center justify-between">
						<span>{title}</span>
						<Button className="w-[90px]" onClick={refetch}>
							<ReloadIcon className={isRefetching || isLoading ? "animate-spin" : undefined} />
							Refresh
						</Button>
					</div>
					{isLoading ? (
						<div className="flex-col items-center justify-center flex-1 gap-4">
							<Spinner inline />
							Loading {databasesLabel}...
						</div>
					) : databases?.length === 0 ? (
						<div className="flex-col items-center justify-center flex-1 gap-3 text-secondary">
							<p>No {databasesLabel.toLowerCase()} found</p>
							<div className="flex-col gap-2">
								{connectMoreDatabases ? (
									<Button primary onClick={connectMoreDatabases}>
										Connect More {databasesLabel}
									</Button>
								) : null}
								<Button onClick={refetch}>
									<ReloadIcon className={isRefetching || isLoading ? "animate-spin" : undefined} />
									Refresh
								</Button>
							</div>
						</div>
					) : (
						<div className="flex-1 flex-col">
							{databases?.map((database) => (
								<DatabaseButton
									key={database.id}
									databaseId={database.id}
									databaseName={database.title}
									icon={database.icon}
									selected={selectedDatabaseId === database.id}
									hasSubdatabases={subdatabases}
									getSubdatabases={getSubdatabases}
									selectedSubdatabase={selectedSubdatabase}
									setSelectedSubdatabase={setSelectedSubdatabase}
									subdatabasesLabel={subdatabasesLabel}
									onClick={() => {
										setSelectedDatabaseId(selectedDatabaseId === database.id ? null : database.id);
										setSelectedSubdatabase(null);
									}}
								/>
							))}
						</div>
					)}
				</div>
				<div className="flex-col p-3 relative">
					<div className="absolute top-0 inset-x-3 h-px bg-divider"></div>
					<Button primary disabled={nextButtonDisabled} onClick={handleSubmit}>
						Next: Configure Collection Fields
					</Button>
				</div>
			</div>
		</Window>
	);
}

function DatabaseButton({
	databaseId,
	databaseName,
	icon,
	selected,
	onClick,
	hasSubdatabases,
	getSubdatabases,
	selectedSubdatabase,
	setSelectedSubdatabase,
	subdatabasesLabel,
}) {
	const [subdatabases, setSubdatabases] = useState(null);
	const [isLoadingSubdatabases, setIsLoadingSubdatabases] = useState(true);

	useEffect(() => {
		if (hasSubdatabases && getSubdatabases && selected) {
			if (!subdatabases) {
				const fetchSubdatabases = async () => {
					const result = await getSubdatabases(databaseId);
					setSubdatabases(result);
					if (result.length) {
						setSelectedSubdatabase(result[0]);
					}
					setIsLoadingSubdatabases(false);
				};
				fetchSubdatabases();
			} else {
				if (subdatabases.length) {
					setSelectedSubdatabase(subdatabases[0]);
				}
			}
		}
	}, [selected]);

	return (
		<div
			className={classNames(
				"relative cursor-pointer flex-col font-semibold rounded",
				selected && "bg-secondary"
			)}
		>
			<div onClick={onClick} className="flex-row gap-2 items-center h-7 px-2">
				{icon}
				{databaseName}
			</div>
			{selected && hasSubdatabases && (
				<div className="flex-col px-1 pb-1 pt-1.5 relative">
					<div className="absolute top-0 inset-x-2 h-px bg-divider-secondary" />
					{isLoadingSubdatabases ? (
						<div className="flex-row items-center justify-center flex-1 gap-2 min-h-6 text-secondary">
							<Spinner inline />
							Loading {subdatabasesLabel}...
						</div>
					) : (
						subdatabases?.map((subdatabase) => (
							<div
								key={subdatabase.id}
								className={classNames(
									"rounded h-6 flex-row items-center px-2",
									selectedSubdatabase === subdatabase
										? "bg-segmented-control text-accent dark:text-primary font-semibold segmented-control-shadow"
										: "text-secondary font-medium"
								)}
								onClick={() => {
									setSelectedSubdatabase(subdatabase);
								}}
							>
								{subdatabase.name}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}
