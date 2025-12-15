import { Logo, FramerLogo } from "../assets/AppIcons";

export default function IntegrationGraphic({ integrationId }) {
	return (
		<div
			className="w-full aspect-[1.8] rounded-lg flex-row items-center justify-center gap-4 bg-no-repeat relative"
			style={{
				backgroundImage: "url(/integration-background.svg)",
			}}
		>
			<div className="flex-1 flex-row justify-end">
				<Logo size={50} id={integrationId} />
			</div>
			<svg
				width="35"
				height="35"
				viewBox="0 0 22 22"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M5.69167 10.7576C5.69167 7.70221 8.08739 5.19856 11.1 5.02549V6.49499C11.1 7.24395 12.0051 7.62317 12.5313 7.08341L15.3545 4.26019C15.6872 3.92751 15.6872 3.40258 15.3545 3.06991L12.5297 0.245035C12.0037 -0.280965 11.1 0.0956678 11.1 0.845237V2.33074C6.59531 2.50563 3 6.2099 3 10.7576C3 11.8533 3.21069 12.9083 3.60153 13.8697C3.96332 14.7663 5.11926 15.0118 5.80666 14.3244C6.16196 13.9691 6.32237 13.4136 6.11153 12.9075L6.11113 12.9066C5.83573 12.2513 5.69167 11.5159 5.69167 10.7576Z"
					fill="white"
				/>
				<path
					d="M17.06 7.19078C16.7063 7.54451 16.5439 8.10953 16.7547 8.60665C17.0227 9.27787 17.175 10.0043 17.175 10.7576C17.175 13.813 14.7793 16.3167 11.7667 16.4897V15.0202C11.7667 14.2713 10.8615 13.892 10.3353 14.4318L7.51213 17.255C7.17946 17.5877 7.17946 18.1126 7.51213 18.4453L10.337 21.2702C10.858 21.7911 11.7667 21.4267 11.7667 20.6801V19.1845C16.2714 19.0096 19.8667 15.3053 19.8667 10.7576C19.8667 9.662 19.656 8.607 19.2652 7.64563C18.9034 6.74899 17.7474 6.50336 17.06 7.19078Z"
					fill="white"
				/>
			</svg>
			<div className="flex-1 flex-row justify-start">
				<FramerLogo size={50} />
			</div>
			<div
				className="absolute inset-0 rounded-[inherit] opacity-30 pointer-events-none"
				style={{
					boxShadow: "0px 4px 16px var(--color-accent)",
				}}
			/>
		</div>
	);
}
