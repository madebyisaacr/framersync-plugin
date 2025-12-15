import { usePluginContext } from "../general/PluginContext";
import { useEffect, useRef, useState } from "react";
import Button from "@shared/Button";
import {
	openGooglePicker,
	getFullSheet,
	getSheetsList,
	getSpreadsheetMetadata,
} from "./googleSheets";
import Window from "../general/Window";
import BackButton from "../components/BackButton";
import { Spinner } from "@shared/spinner/Spinner";
import classNames from "classnames";
import IntegrationGraphic from "../general/IntegrationGraphic";

const apiBaseUrl =
	window.location.hostname === "localhost"
		? "http://localhost:8787/google-sheets"
		: "https://framersync-workers.isaac-b49.workers.dev/google-sheets";

export function SelectDatabasePage() {
	const { updatePluginContext } = usePluginContext();
	const [isLoading, setIsLoading] = useState(false);
	const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState(null);
	const [sheets, setSheets] = useState([]);
	const [selectedSheet, setSelectedSheet] = useState(null);
	const pollIntervalRef = useRef(null);
	const readKeyRef = useRef(null);

	const handleSelectSheet = async () => {
		setIsLoading(true);
		readKeyRef.current = openGooglePicker();

		// Start polling for the picker result
		pollIntervalRef.current = setInterval(pollForPickerResult, 2500);
	};

	const pollForPickerResult = async () => {
		try {
			const response = await fetch(`${apiBaseUrl}/poll-picker?readKey=${readKeyRef.current}`, {
				method: "POST",
			});
			if (response.status === 200) {
				const result = await response.json();
				if (result && result.spreadsheetId) {
					clearInterval(pollIntervalRef.current);
					readKeyRef.current = null;
					await processPickerResult(result);
				}
			}
		} catch (error) {
			console.error("Error polling for picker result:", error);
			setIsLoading(false);
		}
	};

	const processPickerResult = async (result) => {
		const { spreadsheetId } = result;
		setSelectedSpreadsheetId(spreadsheetId);
		const sheetsList = await getSheetsList(spreadsheetId);
		setSheets(sheetsList);
		setSelectedSheet(sheetsList[0]);
		setIsLoading(false);
	};

	const handleSheetSelect = async () => {
		setIsLoading(true);

		if (!selectedSpreadsheetId || !selectedSheet) {
			return;
		}

		const fullSheet = await getFullSheet(selectedSpreadsheetId, selectedSheet.properties.title);

		// Fetch the spreadsheet metadata to get the correct name
		const spreadsheetMetadata = await getSpreadsheetMetadata(selectedSpreadsheetId);

		updatePluginContext({
			integrationContext: {
				spreadsheet: { id: selectedSpreadsheetId, name: spreadsheetMetadata.properties.title },
				sheet: fullSheet,
				spreadsheetId: selectedSpreadsheetId,
				sheetId: fullSheet.properties.sheetId,
			},
		});

		setIsLoading(false);
	};

	const onBackButtonClick = () => {
		updatePluginContext({
			integrationId: null,
			integrationContext: null,
		});
	};

	useEffect(() => {
		if (sheets.length === 1 && selectedSheet && selectedSpreadsheetId) {
			handleSheetSelect();
		}
	}, [sheets, selectedSheet, selectedSpreadsheetId]);

	useEffect(() => {
		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
			}
		};
	}, []);

	return (
		<Window page="Authenticate" className="flex-col size-full overflow-hidden">
			<div className="flex-1 flex-col gap-3 px-3 pb-3 size-full overflow-y-auto">
				<BackButton onClick={onBackButtonClick} className="-mb-1" />
				<h1 className="text-base font-bold text-primary">Select a Google Sheet</h1>
				{selectedSpreadsheetId ? (
					<div className="flex-col gap-2">
						<p>Select a sheet to sync:</p>
						<div className="flex-col p-1 relative bg-secondary rounded-lg">
							{sheets.length === 0 ? (
								<div className="flex-row items-center justify-center flex-1 gap-2 min-h-6 text-secondary">
									<Spinner inline />
									Loading sheets...
								</div>
							) : (
								sheets?.map((sheet) => (
									<div
										key={sheet.properties.sheetId}
										className={classNames(
											"rounded h-6 flex-row items-center px-2 cursor-pointer",
											selectedSheet === sheet
												? "bg-segmented-control text-accent dark:text-primary font-semibold segmented-control-shadow"
												: "text-secondary font-medium"
										)}
										onClick={() => {
											setSelectedSheet(sheet);
										}}
									>
										{sheet.properties.title}
									</div>
								))
							)}
						</div>
					</div>
				) : (
					<>
						<IntegrationGraphic integrationId="google-sheets" />
						<div className="flex-col items-center gap-2 flex-1 w-full text-balance">
							<span className="text-center max-w-[80%] block text-secondary flex-col justify-center items-center flex-1">
								{isLoading
									? "Select a Google Sheet and return to this page to finish setup."
									: "Select a Google Sheet to sync with your Framer CMS collection."}
							</span>
						</div>
						<Button primary onClick={handleSelectSheet} loading={isLoading} disabled={isLoading}>
							Select a Google Sheet
						</Button>
					</>
				)}
			</div>
			{selectedSpreadsheetId && (
				<div className="p-3 relative">
					<div className="absolute top-0 inset-x-3 h-px bg-divider" />
					<Button primary onClick={handleSheetSelect} disabled={!selectedSheet} loading={isLoading}>
						Next: Configure Collection Fields
					</Button>
				</div>
			)}
		</Window>
	);
}
