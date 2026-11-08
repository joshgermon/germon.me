/**
 * The widgets fed by GitHub data, and which GitHub source each one needs.
 */
import type { GitHubSource } from '~/application/github-errors';
import { casesHandled } from '~/lib/defects';
import type { WidgetId } from '~/lib/ui-state';

/** A widget rendered from GitHub activity. */
export type GitHubWidget = Extract<WidgetId, 'projects' | 'commits' | 'contributions'>;

/**
 * The source a widget's data comes from.
 *
 * @param widget - The GitHub widget.
 * @returns `repos` for projects; `contributions` for the commits chart and the heatmap.
 */
export function sourceOf(widget: GitHubWidget): GitHubSource {
  switch (widget) {
    case 'projects':
      return 'repos';
    case 'commits':
    case 'contributions':
      return 'contributions';
    default:
      return casesHandled(widget);
  }
}
