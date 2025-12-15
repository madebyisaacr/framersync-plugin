export function Logo({ id, size = 24, className = "", shadow = false }) {
	return (
		<img
			src={`/logos/${id}.svg`}
			style={{ height: size, filter: shadow ? "drop-shadow(0px 4px 8px rgba(0,0,0,0.07))" : "" }}
			className={className}
		/>
	);
}

export function FramerLogo({ size = 24, className = "" }) {
	return <img src={`/logos/framer.svg`} style={{ height: size }} className={className} />;
}
