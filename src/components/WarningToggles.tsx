import main from '@/app/main.module.scss';
import list from './MemeTagsEditor.module.scss';
import { CONTENT_WARNINGS, WARNING_LABELS, type ContentWarning } from '@/constants/contentWarnings';

// One button per content warning type, pressed when selected: the primary button for on,
// secondary for off, as the queue's task tabs do. Used on upload and on the meme page.
export function WarningToggles(props: {
  selected: readonly ContentWarning[];
  onToggle: (warning: ContentWarning) => void;
  // Types to leave out, such as the ones a meme already carries.
  exclude?: readonly ContentWarning[];
  disabled?: boolean;
}) {
  const on = `${main['button']} ${main['button-small']}`;
  const off = `${main['button']} ${main['button-secondary']} ${main['button-small']}`;
  return (
    <div className={list['tags-list']} role="group" aria-label="Content warnings">
      {CONTENT_WARNINGS.filter((warning) => !props.exclude?.includes(warning)).map((warning) => {
        const pressed = props.selected.includes(warning);
        return (
          <button
            key={warning}
            type="button"
            className={pressed ? on : off}
            aria-pressed={pressed}
            disabled={props.disabled}
            onClick={() => props.onToggle(warning)}
          >
            {WARNING_LABELS[warning]}
          </button>
        );
      })}
    </div>
  );
}
