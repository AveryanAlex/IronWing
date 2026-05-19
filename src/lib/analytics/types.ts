export type AnalyticsEdition = "native" | "web" | "mock" | "remote";

export type AnalyticsProperty = string | number;

export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export type AnalyticsStatus = {
  enabled: boolean;
  edition: AnalyticsEdition;
};

export type AnalyticsEventMap = {
  app_started: {
    edition: AnalyticsEdition;
    build: "development" | "production";
  };
  workspace_viewed: {
    workspace: string;
  };
  connection_started: {
    transport: string;
  };
  connection_succeeded: {
    transport: string;
  };
  connection_failed: {
    transport: string;
    reason: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
