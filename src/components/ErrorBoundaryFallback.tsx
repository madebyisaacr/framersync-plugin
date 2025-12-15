import { QueryErrorResetBoundary } from "@tanstack/react-query";

export function ErrorBoundaryFallback() {
	return (
		<QueryErrorResetBoundary>
			{({ reset }) => {
				return (
					<div className="flex-col w-full h-full gap-2 items-center justify-center">
						<span>Something went wrong...</span>
						<button onClick={reset} className="w-fit px-2">Try again</button>
					</div>
				);
			}}
		</QueryErrorResetBoundary>
	);
}
