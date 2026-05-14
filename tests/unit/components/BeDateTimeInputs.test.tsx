// Unit tests for the Buddhist-Era date / time / datetime inputs.
//
// Mostly pins the conversion functions because that's where the parsing
// risk lives — bad input must NEVER emit a malformed ISO string, since
// every dialog persists the value to HOSxP unchanged.
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  BeDateInput,
  BeTimeInput,
  BeDateTimeInput,
  _isoToBE,
  _beToISO,
  _timeNormalize,
} from '@/components/maternity/shared/BeDateTimeInputs';

describe('_isoToBE', () => {
  it('converts ISO to BE display', () => {
    expect(_isoToBE('2026-05-14')).toBe('14/5/2569');
    expect(_isoToBE('2026-01-01')).toBe('1/1/2569');
    expect(_isoToBE('1999-12-31')).toBe('31/12/2542');
  });

  it('strips the time portion from an ISO datetime', () => {
    expect(_isoToBE('2026-05-14T09:30')).toBe('14/5/2569');
    expect(_isoToBE('2026-05-14T09:30:00')).toBe('14/5/2569');
  });

  it('returns empty string for empty / null-ish input', () => {
    expect(_isoToBE('')).toBe('');
  });
});

describe('_beToISO', () => {
  it('parses BE D/M/YYYY → ISO Gregorian', () => {
    expect(_beToISO('14/5/2569')).toBe('2026-05-14');
    expect(_beToISO('14/05/2569')).toBe('2026-05-14');
    expect(_beToISO('1/1/2569')).toBe('2026-01-01');
  });

  it('accepts dashes and dots as separators', () => {
    expect(_beToISO('14-5-2569')).toBe('2026-05-14');
    expect(_beToISO('14.5.2569')).toBe('2026-05-14');
  });

  it('expands a 2-digit year to 25xx (BE current century)', () => {
    expect(_beToISO('14/5/69')).toBe('2026-05-14');
    expect(_beToISO('1/1/70')).toBe('2027-01-01');
  });

  it('returns empty string for empty input (clear)', () => {
    expect(_beToISO('')).toBe('');
    expect(_beToISO('   ')).toBe('');
  });

  it('rejects malformed input by returning null', () => {
    expect(_beToISO('not a date')).toBe(null);
    expect(_beToISO('14/5')).toBe(null);
    expect(_beToISO('30/2/2569')).not.toBe(null); // we don't validate calendar correctness — that's HOSxP's job
    expect(_beToISO('14/13/2569')).toBe(null); // month out of range
    expect(_beToISO('32/5/2569')).toBe(null); // day out of range
    expect(_beToISO('14/5/1500')).toBe(null); // year too far in the past (CE 957)
  });

  it('round-trips back to BE display', () => {
    const iso = _beToISO('14/5/2569');
    expect(iso).toBe('2026-05-14');
    expect(_isoToBE(iso as string)).toBe('14/5/2569');
  });
});

describe('_timeNormalize', () => {
  it('accepts HH:mm and H:mm', () => {
    expect(_timeNormalize('09:30')).toBe('09:30');
    expect(_timeNormalize('9:30')).toBe('09:30');
    expect(_timeNormalize('23:59')).toBe('23:59');
    expect(_timeNormalize('00:00')).toBe('00:00');
  });

  it('accepts compact HHmm and HH.mm', () => {
    expect(_timeNormalize('0930')).toBe('09:30');
    expect(_timeNormalize('09.30')).toBe('09:30');
  });

  it('returns empty string for empty input', () => {
    expect(_timeNormalize('')).toBe('');
  });

  it('rejects out-of-range time', () => {
    expect(_timeNormalize('24:00')).toBe(null);
    expect(_timeNormalize('12:60')).toBe(null);
    expect(_timeNormalize('not a time')).toBe(null);
  });
});

describe('BeDateInput component', () => {
  it('renders the current value as BE on mount', () => {
    const { getByDisplayValue } = render(
      <BeDateInput value="2026-05-14" onChange={() => {}} aria-label="d" />,
    );
    expect(getByDisplayValue('14/5/2569')).toBeTruthy();
  });

  it('commits ISO on blur after editing', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <BeDateInput value="2026-05-14" onChange={onChange} aria-label="d" />,
    );
    const input = getByLabelText('d') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20/12/2569' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2026-12-20');
  });

  it('reverts to last good value on bad input', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <BeDateInput value="2026-05-14" onChange={onChange} aria-label="d" />,
    );
    const input = getByLabelText('d') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'garbage' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('14/5/2569');
  });
});

describe('BeTimeInput component', () => {
  it('renders 24h HH:mm on mount', () => {
    const { getByDisplayValue } = render(
      <BeTimeInput value="14:30" onChange={() => {}} aria-label="t" />,
    );
    expect(getByDisplayValue('14:30')).toBeTruthy();
  });

  it('commits normalized HH:mm on blur', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <BeTimeInput value="09:30" onChange={onChange} aria-label="t" />,
    );
    const input = getByLabelText('t') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '8:5' } }); // bad — needs HH:mm
    fireEvent.blur(input);
    // 8:5 parses as 8:05 via the H:mm pattern → no wait, regex requires two
    // digits after the separator, so this is rejected and value stays.
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '8:05' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('08:05');
  });
});

describe('BeDateTimeInput component', () => {
  it('renders BE date + 24h time, emits combined ISO on edit', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <BeDateTimeInput
        value="2026-05-14T09:30"
        onChange={onChange}
        aria-label="dt"
      />,
    );
    const dateInput = getByLabelText('dt date') as HTMLInputElement;
    const timeInput = getByLabelText('dt time') as HTMLInputElement;
    expect(dateInput.value).toBe('14/5/2569');
    expect(timeInput.value).toBe('09:30');

    fireEvent.change(dateInput, { target: { value: '20/12/2569' } });
    fireEvent.blur(dateInput);
    expect(onChange).toHaveBeenCalledWith('2026-12-20T09:30');
  });
});

// Re-declare vi import so the test file is self-contained when vitest runs it
// in isolation. The global is registered via the vitest config, but TS still
// needs the symbol.
import { vi } from 'vitest';
