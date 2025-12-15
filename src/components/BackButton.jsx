export default function BackButton({ className = "", onClick = null }) {
	return (
		<span
			onClick={onClick}
			className={`text-tertiary flex-row items-center gap-1 cursor-pointer w-max pr-1 ${className}`}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
				<g transform="translate(1.5 1)">
					<path
						d="M 3.5 0 L 0 4 L 3.5 7.5"
						fill="transparent"
						strokeWidth="1.5"
						stroke="currentColor"
						strokeLinecap="round"
					></path>
				</g>
			</svg>
			Back
		</span>
	);
}
