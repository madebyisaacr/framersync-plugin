import { framer } from "framer-plugin";
import { motion } from "framer-motion";
import classNames from "classnames";

const pageSizes = {
	Integrations: {
		width: 480, // 600
		height: 480,
	},
	Authenticate: {
		width: 350,
		height: 425,
	},
	SelectDatabase: {
		width: 400,
		height: 550,
	},
	SelectDatabaseWide: {
		width: 400 + 300,
		height: 550,
	},
	MapFields: {
		width: 1000,
		height: 650,
	},
	LicenceKey: {
		width: 350,
		height: 600,
	},
};

export default function Window({ page, className, children }) {
	framer.showUI(pageSizes[page]);

	return (
		<motion.div
			className={classNames("size-full", className)}
			initial={{
				opacity: 0,
			}}
			animate={{
				opacity: 1,
			}}
			transition={{
				type: "tween",
				ease: "easeInOut",
				duration: 0.15,
			}}
		>
			{children}
		</motion.div>
	);
}
