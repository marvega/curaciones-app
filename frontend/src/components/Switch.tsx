type SwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  helpText?: string;
  disabled?: boolean;
  id?: string;
};

export default function Switch({
  checked,
  onChange,
  label,
  helpText,
  disabled = false,
  id,
}: SwitchProps) {
  const handleToggle = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={handleToggle}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-4 py-3 text-left transition-opacity ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {helpText && (
          <div className="text-xs text-slate-500 mt-0.5">{helpText}</div>
        )}
      </div>
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
