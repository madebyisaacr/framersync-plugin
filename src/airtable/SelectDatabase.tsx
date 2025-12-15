import { airtableFetch } from "./airtable";
import { useEffect, useState, useRef } from "react";
import { assert } from "../utils";
import { usePluginContext } from "../general/PluginContext";
import SelectDatabasePageTemplate from "../general/SelectDatabaseTemplate";
import classNames from "classnames";

const airtableVideoSrc = "https://framerusercontent.com/assets/fMDvcIZcUwUwxijdTRYkS5aeSJ8.mp4";

export function SelectDatabasePage() {
	const { updatePluginContext } = usePluginContext();

	const [isLoading, setIsLoading] = useState(true);
	const [bases, setBases] = useState([]);
	const [isRefetching, setIsRefetching] = useState(false);

	const [videoPlaying, setVideoPlaying] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);

	async function fetchBases() {
		if (!isLoading) {
			setIsRefetching(true);
		}

		const data = await airtableFetch("meta/bases");

		setBases(data.bases);

		if (isLoading) {
			setIsLoading(false);
		} else {
			setIsRefetching(false);
		}

		if (!data.bases) return;
	}

	// TODO: Implement global cache for bases and tables to prevent refetching twice on first load
	useEffect(() => {
		fetchBases();
	}, []);

	useEffect(() => {
		if (videoRef.current) {
			videoPlaying ? videoRef.current.play() : videoRef.current.pause();
		}
	}, [videoPlaying]);

	const onSubmit = (baseId: string, table: object) => {
		assert(bases);

		const base = bases.find((base) => base.id === baseId);
		if (!base || !table) {
			return;
		}

		updatePluginContext({
			integrationContext: { baseId: base.id, tableId: table.id, baseSchema: base, table },
		});
	};

	const getSubdatabases = async (baseId: string) => {
		const baseSchema = await airtableFetch(`meta/bases/${baseId}/tables`);
		return baseSchema.tables || null;
	};

	const databases = bases.map((base) => ({
		id: base.id,
		title: base.name,
	}));

	return (
		<SelectDatabasePageTemplate
			databases={databases}
			refetch={fetchBases}
			isLoading={isLoading}
			isRefetching={isRefetching}
			onSubmit={onSubmit}
			title="Select an Airtable base to sync"
			subdatabases
			getSubdatabases={getSubdatabases}
			databasesLabel="Bases"
			subdatabasesLabel="Tables"
			instructions={
				<>
					<div
						onClick={() => setVideoPlaying(!videoPlaying)}
						className="w-full relative cursor-pointer"
					>
						<video src={airtableVideoSrc} className="w-full rounded" muted loop ref={videoRef} />
						<div
							className={classNames(
								"absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-sm size-10 bg-[rgba(0,0,0,0.5)] rounded-full flex items-center justify-center transition-[opacity,transform]",
								videoPlaying ? "opacity-0 scale-95" : "opacity-100 scale-100"
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="white"
							>
								<path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
							</svg>
						</div>
						<div className="absolute inset-0 border border-[rgba(0,0,0,0.05)] rounded" />
					</div>
					<div className="flex-col gap-1">
						<p className="font-semibold text-primary">Don't see the base you're looking for?</p>
						<p>Connect another base:</p>
						<p>
							1. Open the{" "}
							<a href="https://airtable.com" target="_blank">
								Airtable dashboard
							</a>
						</p>
						<p>2. Click the account button in the top-right corner</p>
						<p>3. Click Integrations → Third-party integrations → FramerSync</p>
						<p>
							4. Click <strong>+ Add a base</strong> and select a base
						</p>
					</div>
				</>
			}
		/>
	);
}
