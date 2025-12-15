import { useEffect, useRef, useState } from "react";
import Button from "@shared/Button";
import { framer } from "framer-plugin";
import { PluginContext, usePluginContext } from "../general/PluginContext";
import Window from "../general/Window";
import BackButton from "../components/BackButton";
import IntegrationGraphic from "./IntegrationGraphic";

export function AuthenticatePageTemplate({
	onAuthenticated,
	authorize,
	integrationId,
	integrationName,
	accountPlatformName,
	steps,
	databaseLabel,
}) {
	const { pluginContext, updatePluginContext } = usePluginContext();

	const [isLoading, setIsLoading] = useState(false);
	const isDocumentVisible = useIsDocumentVisible();
	const notifiedForContextRef = useRef<PluginContext | null>(null);
	const authPollCancelRef = useRef(null);

	const reauthenticating = pluginContext.type === "update";

	useEffect(() => {
		// after authentication the user may not have returned to Framer yet.
		// So the toast is only displayed upon document being visible
		if (!isDocumentVisible) return;
		// Only notify once per pluginContext
		if (notifiedForContextRef.current === pluginContext) return;
		if (pluginContext.type !== "error") return;

		notifiedForContextRef.current = pluginContext;
		framer.notify(pluginContext.message, { variant: "error" });
	}, [pluginContext, isDocumentVisible]);

	useEffect(() => {
		return () => {
			if (authPollCancelRef.current) {
				authPollCancelRef.current();
			}
		};
	}, []);

	const handleAuth = async () => {
		setIsLoading(true);

		const result = await authorize();

		const { promise, cancel } = result;

		if (authPollCancelRef.current) {
			authPollCancelRef.current();
		}
		authPollCancelRef.current = cancel;

		promise.then(onAuthenticated).finally(() => {
			setIsLoading(false);
		});
	};

	const onBackButtonClick = () => {
		updatePluginContext({ integrationId: null, integrationContext: null });
	};

	return (
		<Window page="Authenticate" className="flex-col justify-center gap-3 pb-3 px-3">
			{!reauthenticating && <BackButton onClick={onBackButtonClick} className="-mb-1" />}
			<h1 className="text-base font-bold text-primary">
				{reauthenticating ? "Reconnect" : "Connect"} your {integrationName} account
				<br />
				with FramerSync
			</h1>
			<IntegrationGraphic integrationId={integrationId} />
			<div className="flex-col items-center gap-2 flex-1 justify-center w-full">
				{isLoading ? (
					<span className="text-center max-w-[80%] block text-secondary text-balance">
						Complete the authentication and return to this page.
					</span>
				) : reauthenticating ? (
					<p className="text-secondary flex-1 text-balance">
						Your {integrationName} account was disconnected or no longer has access. Please
						reconnect your account and share the {databaseLabel} that was previously connected.
					</p>
				) : (
					<ol className="list-inside list-decimal w-full text-secondary gap-2 text-md flex-col flex-1">
						{steps.map((step, index) => (
							<li key={index}>{step}</li>
						))}
					</ol>
				)}
			</div>
			<Button primary onClick={handleAuth} loading={isLoading} disabled={isLoading}>
				Connect your {accountPlatformName} account
			</Button>
		</Window>
	);
}

function useIsDocumentVisible() {
	const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");

	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsVisible(document.visibilityState === "visible");
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	return isVisible;
}
