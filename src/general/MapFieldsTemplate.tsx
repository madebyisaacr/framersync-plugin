import { assert } from "../utils.js";
import { Fragment, useMemo, useState, useEffect, forwardRef, useRef } from "react";
import classNames from "classnames";
import { IconChevron } from "../components/Icons";
import Button from "@shared/Button";
import { cmsFieldIcons } from "../assets/cmsFieldIcons";
import { Spinner } from "@shared/spinner/Spinner";
import { usePluginContext, PluginContext } from "./PluginContext";
import Window from "./Window";
import { SegmentedControl } from "@shared/components";
import { cmsFieldTypeNames } from "./data.js";
import BackButton from "../components/BackButton";
import { motion } from "framer-motion";
import {
	FieldSettings,
	getApplicableFieldSettings,
	defaultFieldSettingValues,
} from "./FieldSettings";
import { getFieldsById } from "./updateCollection";

export interface CollectionFieldConfig {
	property: object;
	isNewField: boolean;
	originalFieldName: string;
	unsupported: boolean;
	conversionTypes: string[];
	isPageLevelField: boolean;
	autoFieldType?: string;
	autoDisabled?: boolean;
	autoFieldSettings?: Record<string, any>;
	effectiveType: string;
}

const TRANSITION = {
	type: "tween",
	ease: [0.25, 1, 0.4, 1],
	duration: 0.35,
};

function getFieldNameOverrides(pluginContext: PluginContext): Record<string, string> {
	if (pluginContext.type !== "update") {
		return {};
	}

	const result: Record<string, string> = {};

	const collectionFieldsById = getFieldsById(pluginContext.collectionFields);

	for (const fieldId of Object.keys(collectionFieldsById)) {
		result[fieldId] = collectionFieldsById[fieldId].name;
	}

	return result;
}

export function MapFieldsPageTemplate(props) {
	const { fieldConfigList, databaseLabel } = props;

	return fieldConfigList ? (
		<MapFieldsPage {...props} />
	) : (
		<Window page="MapFields">
			<div className="absolute inset-0 flex-col items-center justify-center gap-3 font-semibold">
				<Spinner inline />
				Loading {databaseLabel}...
			</div>
		</Window>
	);
}

function MapFieldsPage({
	onSubmit,
	isLoading,
	error,
	updatePluginData,
	getPossibleSlugFields,
	fieldConfigList,
	propertyLabelText,
	slugFieldTitleText,
	databaseName,
	databaseUrl,
	getFieldConversionMessage,
	getPropertyTypeName,
	allFieldSettings,
	getFieldSettings,
	getCollectionFieldForProperty,
	coverImage = null,
	databaseIcon = null,
	databaseLabel = null,
	columnLetters = false,
}: {
	onSubmit: () => void;
	isLoading: boolean;
	error: Error | null;
}) {
	const { pluginContext, updatePluginContext } = usePluginContext();

	// Field config object or "slug"
	const [editMenuFieldConfig, setEditMenuFieldConfig] = useState(null);

	const slugFields = useMemo(() => getPossibleSlugFields(fieldConfigList), [fieldConfigList]);
	const [slugFieldId, setSlugFieldId] = useState<string | null>(() =>
		getInitialSlugFieldId(pluginContext, slugFields)
	);
	const [disabledFieldIds, setDisabledFieldIds] = useState(
		getDisabledFieldIds(fieldConfigList, pluginContext)
	);
	const [fieldNameOverrides, setFieldNameOverrides] = useState<Record<string, string>>(() =>
		getFieldNameOverrides(pluginContext)
	);
	const [fieldTypes, setFieldTypes] = useState(
		createFieldTypesList(fieldConfigList, pluginContext)
	);
	const [fieldSettings, setFieldSettings] = useState(
		getInitialFieldSettings(pluginContext, fieldConfigList, allFieldSettings)
	);

	const fieldElementRefs = useRef({});

	const fieldConfigById = useMemo(() => {
		const result = {};
		for (const fieldConfig of fieldConfigList) {
			result[fieldConfig.property.id] = fieldConfig;
		}
		return result;
	}, [fieldConfigList]);

	const slugFieldConfig = slugFieldId ? fieldConfigById[slugFieldId] : null;

	const handleFieldToggle = (key: string) => {
		setDisabledFieldIds((current) => {
			const nextSet = new Set(current);
			if (nextSet.has(key)) {
				nextSet.delete(key);
			} else {
				nextSet.add(key);
			}

			return nextSet;
		});
	};

	const setFieldImportEnabled = (id: string, enabled: boolean) => {
		setDisabledFieldIds((current) => {
			const nextSet = new Set(current);
			if (enabled) {
				nextSet.delete(id);
			} else {
				nextSet.add(id);
			}

			return nextSet;
		});
	};

	const handleFieldNameChange = (id: string, value: string) => {
		setFieldNameOverrides((current) => ({
			...current,
			[id]: value,
		}));
	};

	const handleFieldTypeChange = (id: string, value: string) => {
		setFieldTypes((current) => ({
			...current,
			[id]: value,
		}));
	};

	const onImportClick = () => {
		if (isLoading) return;

		const fields: any[] = [];

		for (const fieldConfig of fieldConfigList) {
			if (
				!fieldConfig ||
				!fieldConfig.property ||
				fieldConfig.unsupported ||
				disabledFieldIds.has(fieldConfig.property.id)
			) {
				continue;
			}

			fields.push(
				getCollectionFieldForProperty(
					fieldConfig.property,
					fieldNameOverrides[fieldConfig.property.id] || fieldConfig.property.name,
					fieldTypes[fieldConfig.property.id],
					fieldSettings[fieldConfig.property.id]
				)
			);
		}

		updatePluginContext(
			{
				collectionFields: fields,
				slugFieldId,
				disabledFieldIds: Array.from(disabledFieldIds),
				databaseName,
				fieldSettings,
			},
			onSubmit
		);
	};

	const selectField = (id: string) => {
		const fieldConfig = fieldConfigById[id];
		if (fieldConfig) {
			setEditMenuFieldConfig(fieldConfig);
		}
	};

	const toggleEditMenuFieldConfig = (value) => {
		if (value == "slug" || (typeof value == "object" && value?.hasOwnProperty("property"))) {
			setEditMenuFieldConfig(editMenuFieldConfig === value ? null : value);
		}
	};

	const createFieldConfigRow = (fieldConfig: CollectionFieldConfig) => {
		return (
			<FieldConfigRow
				key={fieldConfig.property.id}
				fieldConfig={fieldConfig}
				fieldTypes={fieldTypes}
				disabledFieldIds={disabledFieldIds}
				selectField={selectField}
				handleFieldToggle={handleFieldToggle}
				getFieldConversionMessage={getFieldConversionMessage}
				handleFieldNameChange={handleFieldNameChange}
				handleFieldTypeChange={handleFieldTypeChange}
				fieldNameOverrides={fieldNameOverrides}
				fieldElementRefs={fieldElementRefs}
				getPropertyTypeName={getPropertyTypeName}
				toggleEditMenuFieldConfig={toggleEditMenuFieldConfig}
				columnLetters={columnLetters}
			/>
		);
	};

	const onBackButtonClick = () => {
		updatePluginContext({
			integrationContext: null,
		});
	};

	useEffect(() => {
		const handleEscapeKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setEditMenuFieldConfig(null);
			}
		};

		document.addEventListener("keydown", handleEscapeKey);

		return () => {
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, []);

	const unsupportedFields = fieldConfigList.filter((fieldConfig) => fieldConfig.unsupported);
	const pageLevelFields = fieldConfigList.filter((fieldConfig) => fieldConfig.isPageLevelField);
	const otherFields = fieldConfigList.filter(
		(fieldConfig) => !fieldConfig.isPageLevelField && !fieldConfig.unsupported
	);

	return (
		<Window page="MapFields" className="flex-col gap-3 overflow-hidden">
			<div className="absolute top-0 inset-x-3 h-px bg-divider z-10" />
			<motion.div
				className={classNames(
					"h-full flex-1 overflow-hidden flex-col",
					isLoading && "pointer-events-none"
				)}
				animate={{
					opacity: isLoading ? 0.5 : 1,
					filter: isLoading ? "blur(5px)" : "blur(0px)",
				}}
				transition={TRANSITION}
			>
				<div className="flex-row flex-1 w-full overflow-hidden">
					<div className="flex-col flex-1">
						<div
							className={classNames(
								"flex-col flex-1 p-3 gap-3 transition-opacity relative overflow-y-auto"
							)}
						>
							<div className="flex-col gap-3 mb-2">
								{pluginContext.type === "new" && <BackButton onClick={onBackButtonClick} />}
								{/* {coverImage && (
									<img className="w-full aspect-[5] rounded-lg object-cover" src={coverImage} />
								)} */}
								<div className="flex-row gap-2 items-center">
									{databaseIcon}
									<div className="flex-col gap-0.5">
										<a
											href={databaseUrl}
											target="_blank"
											className="text-lg font-bold hover:underline text-primary"
										>
											{databaseName}
										</a>
										{databaseLabel && (
											<span className="text-tertiary font-medium">{databaseLabel}</span>
										)}
									</div>
								</div>
							</div>
							<div className="relative flex-1 flex-col gap-4">
								{editMenuFieldConfig && (
									<div
										className="absolute inset-x-0 w-full h-6 pointer-events-none"
										style={{
											top: fieldElementRefs.current[
												editMenuFieldConfig == "slug" ? "slug" : editMenuFieldConfig.property.id
											]?.offsetTop,
										}}
									>
										<div
											className="absolute -inset-0.5 rounded-lg"
											style={{
												boxShadow: `0 0 0 2px var(${
													editMenuFieldConfig == "slug" && !slugFieldConfig
														? "--color-error"
														: "--color-accent"
												})`,
											}}
										/>
									</div>
								)}
								<div
									className="grid gap-2 w-full items-center justify-center"
									style={{
										gridTemplateColumns: `1.5fr 5px 1fr 150px auto`,
									}}
								>
									<div className="flex-row justify-between">
										<span className="text-ellipsis text-nowrap overflow-hidden capitalize font-semibold">
											{propertyLabelText}
										</span>
										<span className="text-tertiary text-ellipsis text-nowrap overflow-hidden pr-2">
											Type
										</span>
									</div>
									<div></div>
									<span className="text-ellipsis text-nowrap overflow-hidden font-semibold">
										CMS Field Name
									</span>
									<span className="text-ellipsis text-nowrap overflow-hidden font-semibold">
										Field Type
									</span>
									<div />
									<div
										ref={(el) => (fieldElementRefs.current["slug"] = el)}
										onClick={() => toggleEditMenuFieldConfig("slug")}
										className="w-full relative pl-6 pr-2 rounded bg-secondary h-6 flex-row items-center cursor-pointer hover:bg-tertiary transition-colors"
									>
										{!slugFieldConfig && editMenuFieldConfig !== "slug" && (
											<div className="absolute inset-0 rounded-[inherit] border border-error" />
										)}
										<div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center">
											<input type="checkbox" readOnly checked={true} className="opacity-40" />
										</div>
										<div className="flex-1 flex-row items-center gap-1.5">
											{columnLetters && (
												<ColumnLetter>{slugFieldConfig?.property?.columnLetter}</ColumnLetter>
											)}
											{slugFieldConfig ? (
												slugFieldConfig?.property?.name
											) : (
												<span className="text-error">No slug field</span>
											)}
										</div>
										<span className="text-tertiary">{getPropertyTypeName(slugFieldConfig)}</span>
									</div>
									<div className="flex items-center justify-center">
										<IconChevron />
									</div>
									<StaticInput
										disabled
										onClick={() => toggleEditMenuFieldConfig("slug")}
										className="cursor-pointer"
									>
										Slug
									</StaticInput>
									<FieldTypeSelector
										fieldType="slug"
										availableFieldTypes={["slug"]}
										onClick={() => toggleEditMenuFieldConfig("slug")}
									/>
									<EditButton
										onClick={() => toggleEditMenuFieldConfig("slug")}
										text={slugFieldConfig ? "Edit" : "Error"}
									/>
									{pageLevelFields.map(createFieldConfigRow)}
									{otherFields.length > 0 && <div className="h-px bg-divider col-span-full"></div>}
									{otherFields.map(createFieldConfigRow)}
									{unsupportedFields.length > 0 && (
										<div className="h-px bg-divider col-span-full"></div>
									)}
									{unsupportedFields.map(createFieldConfigRow)}
								</div>
							</div>
						</div>
						{error && (
							<div className="relative w-full flex-row items-center gap-1.5 p-3">
								<div className="absolute top-0 inset-x-3 h-px bg-divider z-10" />
								<div className="size-1.5 bg-error rounded-full" />
								<span className="text-error font-semibold min-h-6 flex-row items-center select-text">
									{error?.message || "Error"}
								</span>
							</div>
						)}
					</div>
					<div className="w-[285px] h-full relative flex-col">
						<div className="absolute left-0 inset-y-3 w-px bg-divider z-10" />
						{editMenuFieldConfig == "slug" ? (
							<div className="w-full flex-1 flex-col overflow-y-auto">
								<div className="relative flex-col gap-1 w-full p-3">
									<h1 className="text-lg font-bold -mb-1">Slug</h1>
									<div className="absolute inset-x-3 bottom-0 h-px bg-divider" />
								</div>
								<div className="flex-col gap-2 overflow-y-auto w-full px-3 pb-3 flex-1">
									<div className="min-h-10 flex-row items-center justify-between -mb-2">
										<span className="text-primary font-semibold">{slugFieldTitleText}</span>
										<span className="text-tertiary pr-2">Type</span>
									</div>
									<div className="flex-col gap-0.5 flex-1">
										{slugFields.length > 0 ? (
											slugFields.map((field) => (
												<label
													key={field.property.id}
													className={classNames(
														"items-center flex-row gap-2 rounded px-2 h-6 cursor-pointer",
														slugFieldId === field.property.id && "bg-secondary"
													)}
												>
													<input
														type="checkbox"
														name="slugField"
														value={field.property.id}
														checked={slugFieldId === field.property.id}
														onChange={(e) => setSlugFieldId(e.target.value)}
														className="size-2.5"
													/>
													{columnLetters && (
														<ColumnLetter
															className={classNames(
																"-mr-0.5",
																slugFieldId === field.property.id ? "opacity-100" : "opacity-60"
															)}
														>
															{field.property?.columnLetter}
														</ColumnLetter>
													)}
													<span
														className={classNames(
															"flex-1",
															slugFieldId === field.property.id ? "text-primary" : "text-secondary"
														)}
													>
														{field.property.name}
													</span>
													<span className="text-tertiary">{getPropertyTypeName(field, true)}</span>
												</label>
											))
										) : (
											<div className="w-full p-3 rounded flex-col gap-1 relative">
												<div className="absolute inset-0 rounded bg-error opacity-10" />
												<div className="absolute inset-0 rounded border-2 border-error" />
												<span className="text-primary font-semibold">No available slug fields</span>
												<span className="text-secondary">
													None of the fields in the {databaseLabel} can be used as a slug. Add a
													text or formula field to use as a slug to import the collection.
												</span>
											</div>
										)}
									</div>
									<div className="flex-col gap-1 p-3 bg-secondary rounded text-secondary">
										<p className="text-primary font-semibold">What is a slug field?</p>
										<p>
											The slug field is a unique ID for each item in the collection. If the CMS
											collection has a detail page, it is used to create a URL for each item.
										</p>
										<p>The selected {propertyLabelText} will be used to generate the slug field.</p>
									</div>
								</div>
							</div>
						) : editMenuFieldConfig ? (
							<EditFieldMenu
								key={editMenuFieldConfig.property.id}
								fieldConfig={editMenuFieldConfig}
								fieldTypes={fieldTypes}
								fieldNames={fieldNameOverrides}
								disabledFieldIds={disabledFieldIds}
								setFieldImportEnabled={setFieldImportEnabled}
								handleFieldNameChange={handleFieldNameChange}
								handleFieldTypeChange={handleFieldTypeChange}
								getFieldConversionMessage={getFieldConversionMessage}
								allFieldSettings={allFieldSettings}
								fieldSettings={fieldSettings}
								setFieldSettings={setFieldSettings}
								getPropertyTypeName={getPropertyTypeName}
								columnLetters={columnLetters}
							/>
						) : (
							<div className="flex-1 flex-col items-center justify-center text-secondary gap-1">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									className="mb-2 text-tertiary"
								>
									<path
										d="M 0 4 C 0 1.791 1.791 0 4 0 L 14 0 C 16.209 0 18 1.791 18 4 L 18 14 C 18 16.209 16.209 18 14 18 L 4 18 C 1.791 18 0 16.209 0 14 Z M 7.5 9 C 7.5 9.828 8.172 10.5 9 10.5 C 9.828 10.5 10.5 9.828 10.5 9 C 10.5 8.172 9.828 7.5 9 7.5 C 8.172 7.5 7.5 8.172 7.5 9 Z M 12 9 C 12 9.828 12.672 10.5 13.5 10.5 C 14.328 10.5 15 9.828 15 9 C 15 8.172 14.328 7.5 13.5 7.5 C 12.672 7.5 12 8.172 12 9 Z M 3 9 C 3 9.828 3.672 10.5 4.5 10.5 C 5.328 10.5 6 9.828 6 9 C 6 8.172 5.328 7.5 4.5 7.5 C 3.672 7.5 3 8.172 3 9 Z"
										fill="currentColor"
									></path>
								</svg>
								<span className="font-semibold text-primary">No field selected</span>
								<span className="text-tertiary">Select a field to edit</span>
							</div>
						)}
						<div className="flex-col p-3 relative">
							<div className="absolute inset-x-3 top-0 h-px bg-divider" />
							<Button primary onClick={() => onImportClick()} disabled={!slugFieldId}>
								{pluginContext.type === "update" ? "Save & Import Collection" : "Import Collection"}
							</Button>
						</div>
					</div>
				</div>
			</motion.div>
			{isLoading && (
				<div className="absolute inset-0 flex-col items-center justify-center gap-3 font-semibold">
					<Spinner inline />
					Importing items...
				</div>
			)}
		</Window>
	);
}

function UnsupportedFieldBlock({ title, text }) {
	const [hover, setHover] = useState(false);

	return (
		<div
			className="col-span-3 w-full h-6 relative"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			<div className="size-full flex items-center bg-secondary rounded opacity-50 px-2">
				Unsupported Field Type
			</div>
			{text && (
				<div
					className={classNames(
						"flex-col gap-1.5 rounded-lg p-3 w-full z-10 text-secondary bg-modal pointer-events-none absolute -top-2 -translate-y-[100%] transition-opacity",
						hover ? "opacity-100" : "opacity-0"
					)}
					style={{
						boxShadow: "rgba(0, 0, 0, 0.1) 0px 10px 20px 0px",
					}}
				>
					<p className="text-primary font-semibold">{title}</p>
					{text}
				</div>
			)}
		</div>
	);
}

function FieldTypeSelector({
	onClick = null,
	fieldType,
	availableFieldTypes,
	autoFieldType = null,
	disabled = false,
	segmentedControl = false,
	onChange = (value) => {},
}) {
	if (availableFieldTypes.length === 1) {
		return (
			<div className={classNames("relative", onClick && "cursor-pointer")} onClick={onClick}>
				<StaticInput disabled={disabled} className="pl-[34px]">
					{cmsFieldTypeNames[fieldType]}
				</StaticInput>
				<FieldTypeIcon fieldType={fieldType} disabled={disabled} />
			</div>
		);
	} else if (segmentedControl) {
		const transition = { type: "spring", stiffness: "900", damping: "60" };
		const currentItemIndex = availableFieldTypes.indexOf(fieldType);

		return (
			<div onClick={onClick} className="relative flex-col p-0.5 gap-0.5 bg-secondary rounded">
				{currentItemIndex >= 0 && (
					<div className="absolute inset-0.5">
						<motion.div
							animate={{
								top: `${currentItemIndex * 32}px`,
							}}
							className="absolute inset-x-0 rounded-[6px] h-6 bg-segmented-control segmented-control-shadow"
							initial={false}
							transition={transition}
						/>
					</div>
				)}
				{autoFieldType && (
					<div
						className="absolute w-4 h-6 flex-col items-center justify-center top-0.5 -left-4 text-tertiary hover:text-secondary transition-colors"
						style={{ translate: `0px ${availableFieldTypes.indexOf(autoFieldType) * 32}px` }}
						title="Field type automatically detected from field values"
					>
						<AutoDetectIcon />
					</div>
				)}
				{availableFieldTypes.map((type) => (
					<div
						key={type}
						onClick={() => onChange(type)}
						className={classNames(
							"relative w-full pl-[34px] pr-1 h-6 cursor-pointer flex-col justify-center transition-colors",
							fieldType === type ? "text-primary" : "text-secondary"
						)}
					>
						{cmsFieldTypeNames[type]}
						<FieldTypeIcon
							fieldType={type}
							disabled={disabled}
							className={`transition-opacity ${fieldType === type ? "opacity-100" : "opacity-70"}`}
						/>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="relative cursor-pointer" onClick={onClick}>
			<select
				disabled={disabled}
				value={fieldType}
				onChange={(e) => onChange(e.target.value)}
				className="pl-[34px] w-full"
			>
				{availableFieldTypes?.map((type) => (
					<option key={type} value={type}>
						{cmsFieldTypeNames[type]}
					</option>
				))}
			</select>
			<FieldTypeIcon fieldType={fieldType} disabled={disabled} />
		</div>
	);
}

function FieldTypeIcon({ fieldType, disabled = false, className = "" }) {
	return (
		<div
			className={classNames(
				"text-accent absolute top-[4px] left-[4px] pointer-events-none",
				disabled && "opacity-50",
				className
			)}
		>
			{cmsFieldIcons[fieldType]}
		</div>
	);
}

const StaticInput = forwardRef(
	({ children, disabled = false, className = "", leftText = "", onClick = null }, ref) => {
		return (
			<div
				ref={ref}
				onClick={onClick}
				className={classNames(
					"relative w-full h-6 flex items-center justify-between bg-secondary rounded gap-1.5 px-2 min-w-0 text-ellipsis text-nowrap overflow-hidden",
					disabled && "opacity-50",
					className
				)}
			>
				<span className="shrink-0 flex-row items-center gap-1.5">{children}</span>
				{leftText && (
					<span
						className={classNames(
							"text-right text-ellipsis text-nowrap overflow-hidden shrink",
							disabled ? "text-secondary" : "text-tertiary"
						)}
						title={leftText}
					>
						{leftText}
					</span>
				)}
			</div>
		);
	}
);

function createFieldTypesList(
	fieldConfigList: CollectionFieldConfig[],
	pluginContext: PluginContext
) {
	const result: Record<string, string> = {};

	for (const fieldConfig of fieldConfigList) {
		const conversionTypes = fieldConfig.conversionTypes;
		if (!fieldConfig.property || !conversionTypes?.length) {
			continue;
		}

		const defaultType = fieldConfig.autoFieldType || fieldConfig.conversionTypes[0];

		if (pluginContext.type !== "update") {
			result[fieldConfig.property.id] = defaultType;
		} else {
			const field = pluginContext.collectionFields.find(
				(field) => field.id === fieldConfig.property.id
			);

			if (field && conversionTypes.includes(field.type)) {
				result[fieldConfig.property.id] = field.type;
			} else {
				result[fieldConfig.property.id] = defaultType;
			}
		}
	}

	return result;
}

function EditFieldMenu({
	fieldConfig,
	fieldTypes,
	fieldNames,
	fieldSettings,
	setFieldSettings,
	disabledFieldIds,
	setFieldImportEnabled,
	handleFieldNameChange,
	handleFieldTypeChange,
	getFieldConversionMessage,
	allFieldSettings,
	getPropertyTypeName,
	columnLetters,
}) {
	const id = fieldConfig.property.id;
	const fieldType = fieldTypes[id];
	const fieldName = fieldNames[id] || fieldConfig.property.name;
	const disabled = disabledFieldIds.has(id);
	const settings = fieldSettings[id] || {};

	const fieldConversionMessage = getFieldConversionMessage(fieldConfig, fieldType);

	const applicableSettings = useMemo(
		() => getApplicableFieldSettings(fieldConfig, fieldType, allFieldSettings),
		[fieldConfig, fieldType, allFieldSettings]
	);

	const fieldSettingMessages = [];
	for (const setting of allFieldSettings) {
		if (
			(!setting.propertyType ||
				setting.propertyType === fieldConfig.property.type ||
				setting.propertyType === fieldConfig.effectiveType) &&
			(!setting.fieldType || setting.fieldType === fieldType)
		) {
			fieldSettingMessages.push(setting);
		}
	}

	return (
		<div className="flex-1 w-full flex-col overflow-hidden">
			<div className="relative flex-col gap-1 w-full px-3 pt-3 pb-2">
				<h1 className="text-lg font-bold -mb-1">{fieldConfig.property.name}</h1>
				<p className="mb-1 text-tertiary">
					{getPropertyTypeName(fieldConfig, true)}
					{columnLetters && ` • Column ${fieldConfig.property.columnLetter}`}
				</p>
				<div className="absolute inset-x-3 bottom-0 h-px bg-divider" />
			</div>
			<div className="flex-col gap-2 overflow-y-auto w-full px-3 pb-3 flex-1">
				<div className="min-h-10 flex-row items-center text-primary font-semibold -mb-2">
					Field Settings
				</div>
				<PropertyControl title="Import Field">
					<SegmentedControl
						id={`import-${id}`}
						items={[true, false]}
						itemTitles={["Yes", "No"]}
						currentItem={!disabled}
						tint
						onChange={(value) => {
							setFieldImportEnabled(id, value);
						}}
					/>
				</PropertyControl>
				<div
					className={classNames(
						"flex-col gap-2 w-full transition-opacity",
						disabled && "opacity-50 pointer-events-none"
					)}
				>
					<PropertyControl title="Name">
						<input
							type="text"
							className="w-full"
							value={fieldNames[id] || ""}
							placeholder={fieldConfig.property.name}
							onChange={(e) => handleFieldNameChange(id, e.target.value)}
						/>
					</PropertyControl>
					<PropertyControl title="Field Type">
						<FieldTypeSelector
							fieldType={fieldTypes[id]}
							availableFieldTypes={fieldConfig.conversionTypes}
							autoFieldType={fieldConfig.autoFieldType}
							onChange={(value) => handleFieldTypeChange(id, value)}
							segmentedControl
						/>
					</PropertyControl>
					{fieldConversionMessage && (
						<div
							className={classNames(
								"p-3 bg-secondary rounded text-secondary flex-col gap-1.5 transition-opacity",
								disabled && "opacity-50"
							)}
						>
							<p className="text-primary font-semibold">{fieldConversionMessage.title}</p>
							{fieldConversionMessage.text}
						</div>
					)}
					{applicableSettings.includes(FieldSettings.NoneOption) && (
						<PropertyControl title="None Option">
							<input
								type="text"
								className="w-full"
								value={
									settings?.[FieldSettings.NoneOption] ??
									defaultFieldSettingValues[FieldSettings.NoneOption]
								}
								placeholder="None"
								onChange={(e) =>
									setFieldSettings({
										...fieldSettings,
										[id]: { ...settings, [FieldSettings.NoneOption]: e.target.value },
									})
								}
							/>
						</PropertyControl>
					)}
					{applicableSettings.includes(FieldSettings.MultipleFields) && (
						<>
							<PropertyControl title="Multiple Fields">
								<SegmentedControl
									id={`multipleFields-${id}`}
									items={[true, false]}
									itemTitles={["Yes", "No"]}
									currentItem={
										settings[FieldSettings.MultipleFields] ??
										defaultFieldSettingValues[FieldSettings.MultipleFields]
									}
									tint
									onChange={(value) => {
										setFieldSettings({
											...fieldSettings,
											[id]: { ...settings, [FieldSettings.MultipleFields]: value },
										});
									}}
								/>
							</PropertyControl>
							<div
								className={classNames(
									"p-3 bg-secondary rounded text-secondary flex-col gap-1.5 transition-opacity",
									disabled && "opacity-50"
								)}
							>
								{fieldSettingMessages.find((msg) => msg[FieldSettings.MultipleFields])?.[
									FieldSettings.MultipleFields
								][settings[FieldSettings.MultipleFields] === false ? "false" : "true"] || ""}
								{settings[FieldSettings.MultipleFields] !== false && (
									<p>
										<span className="text-primary font-semibold">Preview:</span> {fieldName} 1,{" "}
										{fieldName} 2, {fieldName} 3, ...
									</p>
								)}
							</div>
						</>
					)}
					{/* {applicableSettings.includes(FieldSettings.Time) && (
						<PropertyControl title="Include Time">
							<SegmentedControl
								id={`timeOption-${id}`}
								items={[true, false]}
								itemTitles={["Yes", "No"]}
								currentItem={settings?.[FieldSettings.Time] ?? defaultFieldSettingValues[FieldSettings.Time]}
								tint
								onChange={(value) => {
									setFieldSettings({
										...fieldSettings,
										[id]: { ...settings, [FieldSettings.Time]: value },
									});
								}}
							/>
						</PropertyControl>
					)} */}
					{applicableSettings.includes(FieldSettings.ImportMarkdownOrHTML) && (
						<PropertyControl title="Text Format">
							<SegmentedControl
								id={`importMarkdownOrHTML-${id}`}
								items={["html", "markdown"]}
								itemTitles={["HTML", "Markdown"]}
								currentItem={
									settings?.[FieldSettings.ImportMarkdownOrHTML] ??
									defaultFieldSettingValues[FieldSettings.ImportMarkdownOrHTML]
								}
								tint
								vertical
								onChange={(value) => {
									setFieldSettings({
										...fieldSettings,
										[id]: { ...settings, [FieldSettings.ImportMarkdownOrHTML]: value },
									});
								}}
							>
								{fieldConfig.autoFieldSettings?.[FieldSettings.ImportMarkdownOrHTML] && (
									<div
										className="absolute w-4 h-6 flex-col items-center justify-center top-0.5 -left-4 text-tertiary hover:text-secondary transition-colors"
										style={{
											translate: `0px ${
												fieldConfig.autoFieldSettings[FieldSettings.ImportMarkdownOrHTML] ==
												"markdown"
													? 30
													: 0
											}px`,
										}}
										title="Field type automatically detected from field values"
									>
										<AutoDetectIcon />
									</div>
								)}
							</SegmentedControl>
						</PropertyControl>
					)}
					{applicableSettings.includes(FieldSettings.ImportDefaultMarkdownOrHTML) && (
						<PropertyControl title="Text Format">
							<SegmentedControl
								id={`importDefaultMarkdownOrHTML-${id}`}
								items={["default", "html", "markdown"]}
								itemTitles={["Default", "HTML", "Markdown"]}
								currentItem={
									settings?.[FieldSettings.ImportDefaultMarkdownOrHTML] ??
									defaultFieldSettingValues[FieldSettings.ImportDefaultMarkdownOrHTML]
								}
								tint
								vertical
								onChange={(value) => {
									setFieldSettings({
										...fieldSettings,
										[id]: { ...settings, [FieldSettings.ImportDefaultMarkdownOrHTML]: value },
									});
								}}
							/>
						</PropertyControl>
					)}
				</div>
			</div>
		</div>
	);
}

function PropertyControl({ title, children }) {
	return (
		<div
			className="grid gap-2 w-full"
			style={{
				gridTemplateColumns: "minmax(0,1.5fr) repeat(2,minmax(62px,1fr))",
			}}
		>
			<span className="text-secondary pl-2 h-6 flex items-center">{title}</span>
			<div className="col-span-2">{children}</div>
		</div>
	);
}

function EditButton({ onClick, text = "Edit" }) {
	return (
		<Button type="button" onClick={onClick}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="-mr-0.5"
			>
				{text == "Edit" ? (
					<>
						<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
						<path d="M13.5 6.5l4 4" />
					</>
				) : text == "Error" ? (
					<>
						<path d="M12 9v4" />
						<path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
						<path d="M12 16h.01" />
					</>
				) : null}
			</svg>
			{text}
		</Button>
	);
}

function FieldConfigRow({
	fieldConfig,
	fieldTypes,
	disabledFieldIds,
	selectField,
	handleFieldToggle,
	getFieldConversionMessage,
	handleFieldNameChange,
	handleFieldTypeChange,
	fieldNameOverrides,
	fieldElementRefs,
	getPropertyTypeName,
	toggleEditMenuFieldConfig,
	columnLetters = false,
}: {
	fieldConfig: CollectionFieldConfig;
}) {
	const property = fieldConfig.property;
	const id = property?.id;
	const unsupported = fieldConfig.unsupported;
	const isDisabled = !fieldTypes[id] || disabledFieldIds.has(id);

	return (
		<Fragment key={fieldConfig.originalFieldName}>
			<StaticInput
				ref={(el) => (fieldElementRefs.current[id] = el)}
				disabled={isDisabled}
				leftText={getPropertyTypeName(fieldConfig)}
				className={classNames("pl-6", property && !unsupported && "cursor-pointer")}
				onClick={unsupported ? null : () => selectField(id)}
			>
				<label
					className={classNames(
						"absolute left-0 inset-y-0 w-6 flex items-center justify-center",
						property && !unsupported && "cursor-pointer"
					)}
				>
					<input
						type="checkbox"
						id={`${id}-checkbox`}
						disabled={!property}
						checked={!!property && !isDisabled}
						className={classNames(
							(disabledFieldIds.has(id) || !property || unsupported) &&
								"!bg-[#b4b4b4] dark:!bg-[#5b5b5b]",
							"pointer-events-none"
						)}
						onChange={() => {
							assert(property);
							handleFieldToggle(id);
						}}
					/>
				</label>
				{columnLetters && <ColumnLetter>{fieldConfig.property.columnLetter}</ColumnLetter>}
				{fieldConfig.originalFieldName}
				{fieldConfig.isNewField && !unsupported && (
					<div className="bg-segmented-control rounded-sm px-[6px] py-[2px] text-[10px] font-semibold segmented-control-shadow">
						New
					</div>
				)}
			</StaticInput>
			<div className={classNames("flex items-center justify-center", isDisabled && "opacity-50")}>
				<IconChevron />
			</div>
			{!fieldTypes[id] ? (
				<UnsupportedFieldBlock {...getFieldConversionMessage(fieldConfig, fieldTypes[id])} />
			) : (
				<>
					<input
						type="text"
						className={classNames("w-full", isDisabled && "opacity-50")}
						disabled={isDisabled}
						placeholder={fieldConfig.originalFieldName}
						value={fieldNameOverrides[id] ?? ""}
						onFocus={() => selectField(id)}
						onChange={(e) => {
							assert(property);
							handleFieldNameChange(id, e.target.value);
						}}
					></input>
					<FieldTypeSelector
						fieldType={fieldTypes[id]}
						availableFieldTypes={fieldConfig.conversionTypes}
						autoFieldType={fieldConfig.autoFieldType}
						disabled={isDisabled}
						onChange={(value) => handleFieldTypeChange(id, value)}
						onClick={() => selectField(id)}
					/>
				</>
			)}
			{!unsupported && <EditButton onClick={() => toggleEditMenuFieldConfig(fieldConfig)} />}
		</Fragment>
	);
}

function ColumnLetter({ children, className = "" }) {
	return (
		<div
			className={classNames(
				"bg-segmented-control rounded-sm px-1 min-w-[18px] h-[18px] text-[10px] font-semibold transition-colors segmented-control-shadow flex-col items-center justify-center",
				className
			)}
		>
			{children}
		</div>
	);
}

function getInitialSlugFieldId(pluginContext: PluginContext, fieldConfigList: object[]) {
	if (pluginContext.type === "update" && pluginContext.slugFieldId)
		return pluginContext.slugFieldId;

	return fieldConfigList[0]?.property?.id ?? null;
}

function getDisabledFieldIds(
	fieldConfigList: CollectionFieldConfig[],
	pluginContext: PluginContext
): Set<string> {
	if (pluginContext.type === "update") {
		return new Set(pluginContext.disabledFieldIds);
	} else {
		const disabledFieldIds = new Set<string>();

		for (const fieldConfig of fieldConfigList) {
			if (fieldConfig.autoDisabled) {
				disabledFieldIds.add(fieldConfig.property.id);
			}
		}

		return disabledFieldIds;
	}
}

function getInitialFieldSettings(
	pluginContext: PluginContext,
	fieldConfigList: CollectionFieldConfig[],
	allFieldSettings: object[]
) {
	const { fieldSettings } = pluginContext;

	let settings = {};

	for (const fieldConfig of fieldConfigList) {
		const id = fieldConfig.property.id;
		if (pluginContext.type === "update") {
			settings[id] = { ...fieldConfig.autoFieldSettings, ...fieldSettings[id] };
		} else {
			settings[id] = fieldConfig.autoFieldSettings || {};
		}

		const applicableSettings = getApplicableFieldSettings(
			fieldConfig,
			fieldConfig.conversionTypes[0],
			allFieldSettings
		);

		for (const setting of applicableSettings) {
			if (!settings[id].hasOwnProperty(setting)) {
				settings[id][setting] = defaultFieldSettingValues[setting];
			}
		}
	}

	return settings;
}

function AutoDetectIcon() {
	return (
		<svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M1.06045 7.99999C0.593446 7.99999 0.305446 7.49099 0.545446 7.09099L4.37445 0.709993C4.71545 0.141993 5.58944 0.463993 5.48044 1.11699L5.09745 3.41799C5.04645 3.72299 5.28145 3.99999 5.59045 3.99999H8.94044C9.40744 3.99999 9.69545 4.50899 9.45545 4.90899L5.62645 11.29C5.28545 11.858 4.41145 11.536 4.52045 10.883L4.90345 8.58199C4.95445 8.27699 4.71945 7.99999 4.41045 7.99999H1.06045Z"
				fill="currentColor"
			/>
		</svg>
	);
}
