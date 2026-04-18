<script lang="ts">
type LogFileEntry = {
  name: string;
  sizeBytes: number;
  timestamp: Date;
};

let files = $state<LogFileEntry[]>([]);
let selectedFile = $state<LogFileEntry | null>(null);
</script>

<section class="logs-workspace">
  <h2 class="logs-workspace__title">Log Analysis</h2>

  <div class="logs-browser">
    <h3 class="logs-browser__heading">File Browser</h3>

    {#if files.length === 0}
      <div class="logs-browser__empty">
        <p class="logs-browser__empty-title">No log files available.</p>
        <p class="logs-browser__empty-hint">Connect to a vehicle or open a file to begin analysis.</p>
      </div>
    {:else}
      <ul class="logs-browser__list">
        {#each files as file (file.name)}
          <li>
            <button
              class="logs-browser__entry"
              class:logs-browser__entry--selected={selectedFile?.name === file.name}
              onclick={() => (selectedFile = file)}
              type="button"
            >
              <span class="logs-browser__entry-name">{file.name}</span>
              <span class="logs-browser__entry-size">
                {(file.sizeBytes / 1024).toFixed(0)} KB
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if selectedFile}
    <div class="logs-summary">
      <h3 class="logs-summary__heading">Summary</h3>
      <div class="logs-summary__bar">
        <span class="logs-summary__label">File</span>
        <span class="logs-summary__value">{selectedFile.name}</span>
      </div>
    </div>

    <div class="logs-charts">
      <h3 class="logs-charts__heading">Charts</h3>
      <div class="logs-charts__grid">
        <div class="logs-charts__placeholder">
          <p>Chart rendering will be available when backend log parsing is implemented.</p>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .logs-workspace {
    overflow-y: auto;
    padding: 12px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .logs-workspace__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .logs-browser {
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    padding: 12px;
  }

  .logs-browser__heading {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }

  .logs-browser__empty {
    padding: 16px 0;
    text-align: center;
  }

  .logs-browser__empty-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .logs-browser__empty-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 4px 0 0;
  }

  .logs-browser__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .logs-browser__entry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .logs-browser__entry:hover {
    background: var(--color-bg-primary);
  }

  .logs-browser__entry--selected {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-accent);
  }

  .logs-browser__entry-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .logs-browser__entry-size {
    font-family: "JetBrains Mono", monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .logs-summary {
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    padding: 12px;
  }

  .logs-summary__heading {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }

  .logs-summary__bar {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .logs-summary__label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .logs-summary__value {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.8rem;
    color: var(--color-text-primary);
  }

  .logs-charts {
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    padding: 12px;
    flex: 1;
    min-height: 0;
  }

  .logs-charts__heading {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }

  .logs-charts__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    min-height: 120px;
  }

  .logs-charts__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    border-radius: 4px;
    border: 1px dashed var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    text-align: center;
  }
</style>
