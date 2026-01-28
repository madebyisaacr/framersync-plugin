import { forwardRef } from "react";
import classNames from "classnames";

const Button = forwardRef(function Button(
	{
		primary = false,
		square = false,
		children,
		className = "",
		style = {},
		href = "",
		onClick = null,
		loading = false,
		disabled = false,
		customColor = "",
		...otherProps
	},
	ref,
) {
	const Element = href ? "a" : "button";

	customColor = customColor || (primary ? "var(--color-accent)" : null);

	return (
		<Element
			ref={ref}
			href={href}
			target={href ? "_blank" : undefined}
			onClick={onClick}
			className={classNames(
				"relative flex items-center gap-1.5 justify-center rounded font-semibold border-none text-xs min-h-6 max-h-6 decoration-[none] overflow-visible",
				square ? "min-w-6 max-w-6" : "px-2",
				primary
					? "bg-accent text-[#FFF] rounded transition-[filter] hover:!bg-accent active:!bg-accent focus:!bg-accent"
					: customColor
						? ""
						: "bg-secondary text-primary hover:bg-tertiary active:!bg-tertiary transition-colors",
				disabled ? "opacity-60" : "cursor-pointer",
				!disabled && primary && "hover:brightness-110",
				className,
			)}
			style={{
				background: customColor,
				...style,
			}}
			disabled={disabled}
			{...otherProps}
		>
			{customColor && (
				<div
					className="absolute inset-0 rounded-[inherit] opacity-30 pointer-events-none"
					style={{
						background: customColor,
						filter: "blur(8px)",
						transform: "translateY(4px)",
					}}
				/>
			)}
			{loading ? (
				<div className="absolute top-0 right-0 left-0 bottom-0 flex items-center justify-center">
					<div className="framer-spinner" />
				</div>
			) : (
				<div className="relative flex items-center gap-1.5 justify-center">{children}</div>
			)}
		</Element>
	);
});

export default Button;
