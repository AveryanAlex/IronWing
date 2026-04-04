export type {
    CatalogEntry,
    CommandMetadata,
    FrameDescriptor,
    ParamDescriptor,
    ParamSlot,
    TypedFieldDescriptor,
} from "./mission-command-metadata/registry";

export {
    COMMAND_CATALOG,
    commandIdToVariant,
    getCommandCatalog,
    getCommandMetadata,
    mappedCommandIds,
    rawFallbackParams,
    resolveCommandMetadata,
    variantToCommandId,
} from "./mission-command-metadata/registry";
