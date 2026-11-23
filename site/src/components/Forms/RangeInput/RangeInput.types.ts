export interface RangeInputProps {
  /**
   * The unique identifier for the input
   */
  id: string;

  /**
   * The label text displayed above the slider
   */
  label: string;

  /**
   * Keep the label (and its value) for screen readers only, when the slider's surroundings
   * already say what it is and where it is, as a playback scrubber beside its time
   * @default false
   */
  hideLabel?: boolean;

  /**
   * The current value of the slider
   */
  value: number;

  /**
   * Minimum value for the slider
   * @default 0
   */
  min?: number;

  /**
   * Maximum value for the slider
   * @default 100
   */
  max?: number;

  /**
   * Step increment for the slider
   * @default 1
   */
  step?: number;

  /**
   * Optional suffix to display after the value (e.g., "%", "ms")
   */
  suffix?: string;

  /**
   * Callback fired when the value changes
   */
  onChange: (value: number) => void;

  /**
   * Keep the label for screen readers only, as for a playback scrubber whose value shows beside it
   * @default false
   */
  hideLabel?: boolean;

  /**
   * Optional CSS class name for the container
   */
  className?: string;
}
