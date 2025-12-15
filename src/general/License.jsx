import { useEffect, useContext, createContext, useState } from "react";
import { framer } from "framer-plugin";

export const CHECKOUT_URL = "https://store.framersync.com/buy/6d6eb4c9-8ea4-462f-b7b3-f2080a4582b3";

const PluginDataLicenseKey = "lemonSqueezyLicenseKey";
const PluginDataInstanceId = "lemonSqueezyInstanceId";

export const LicenseContext = createContext();

export function useLicense() {
	return useContext(LicenseContext);
}

export function LemonSqueezyProvider({ children }) {
	const [isLoading, setIsLoading] = useState(true);
	const [hasLicenseKey, setHasLicenseKey] = useState(false);

	useEffect(() => {
		framer.getPluginData(PluginDataLicenseKey).then((licenseKey) => {
			setHasLicenseKey(Boolean(licenseKey));
			setIsLoading(false);
		});
	}, []);

	return (
		<LicenseContext.Provider
			value={{
				isLoading,
				hasLicenseKey,
			}}
		>
			{children}
		</LicenseContext.Provider>
	);
}
