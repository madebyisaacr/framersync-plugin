import { motion } from "framer-motion";
import classNames from "classnames";

export function SegmentedControl({
	items,
	id,
	itemTitles = null,
	currentItem,
	onChange,
	className = "",
	tint = false,
	vertical = false,
	children = null,
}) {
	const transition = { type: "spring", stiffness: "900", damping: "60" };

	const currentItemIndex = items?.indexOf(currentItem) ?? 0;

	const dividers = [];
	if (!vertical) {
		for (let i = 0; i < items?.length - 1; i++) {
			dividers.push(
				<motion.div
					key={`${id}-divider-${i}`}
					animate={{
						opacity: i === currentItemIndex || i + 1 === currentItemIndex ? 0 : 1,
					}}
					className="absolute w-px h-[16px] top-[7px] bg-divider-secondary"
					style={{
						left: `${(i + 1) * (100 / items?.length)}%`,
					}}
					initial={false}
					transition={transition}
				/>
			);
		}
	}

	return (
		<div
			className={classNames(
				"relative flex bg-tertiary p-0.5 rounded",
				className,
				vertical ? "flex-col" : "flex-row h-6 min-h-6"
			)}
		>
			{currentItemIndex >= 0 && (
				<div className="absolute inset-0.5">
					<motion.div
						animate={{
							left: vertical ? 0 : `${(100 / items?.length) * currentItemIndex}%`,
							top: vertical ? `${currentItemIndex * 30}px` : 0,
						}}
						className={classNames(
							"absolute rounded-[6px] bg-segmented-control segmented-control-shadow",
							vertical ? "h-6" : "h-full"
						)}
						style={{
							width: vertical ? "100%" : `${100 / items?.length}%`,
						}}
						initial={false}
						transition={transition}
					/>
				</div>
			)}
			{dividers}
			{items?.map((item, index) => (
				<div
					key={`${id}-${item}`}
					onClick={() => onChange(item)}
					className={classNames(
						"relative flex flex-row flex-1 items-center cursor-pointer transition-colors",
						index === currentItemIndex ? "font-semibold" : "",
						index === currentItemIndex
							? tint
								? "text-accent dark:text-primary"
								: "text-primary"
							: "text-tertiary",
						vertical ? "min-h-6 pl-2" : "h-full justify-center"
					)}
				>
					<span className="z-[1]">{itemTitles ? itemTitles[index] : item}</span>
				</div>
			))}
			{children}
		</div>
	);
}
