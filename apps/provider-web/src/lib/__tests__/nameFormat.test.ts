import { describe, it, expect } from 'vitest';
import {
  formatPrivacyName,
  formatPrivacyNameFromFull,
  getInitials,
  getDateLabel,
} from '../nameFormat';

describe('nameFormat (provider-web)', () => {
  describe('formatPrivacyName', () => {
    it('formats first and last name as "First L."', () => {
      expect(formatPrivacyName('John', 'Doe')).toBe('John D.');
    });

    it('returns just first name when last name is missing', () => {
      expect(formatPrivacyName('Jane', null)).toBe('Jane');
      expect(formatPrivacyName('Jane', undefined)).toBe('Jane');
      expect(formatPrivacyName('Jane', '')).toBe('Jane');
    });

    it('returns fallback when both names are empty', () => {
      expect(formatPrivacyName(null, null)).toBe('User');
      expect(formatPrivacyName('', '')).toBe('User');
      expect(formatPrivacyName(undefined, undefined)).toBe('User');
    });

    it('uses custom fallback', () => {
      expect(formatPrivacyName(null, null, 'Anonymous')).toBe('Anonymous');
    });

    it('trims whitespace', () => {
      expect(formatPrivacyName('  John  ', '  Doe  ')).toBe('John D.');
    });

    it('capitalizes last initial', () => {
      expect(formatPrivacyName('John', 'doe')).toBe('John D.');
    });
  });

  describe('formatPrivacyNameFromFull', () => {
    it('formats "John Doe" as "John D."', () => {
      expect(formatPrivacyNameFromFull('John Doe')).toBe('John D.');
    });

    it('returns single name as-is', () => {
      expect(formatPrivacyNameFromFull('Madonna')).toBe('Madonna');
    });

    it('handles multiple space-separated names', () => {
      expect(formatPrivacyNameFromFull('Mary Jane Watson')).toBe('Mary W.');
    });

    it('returns fallback for empty input', () => {
      expect(formatPrivacyNameFromFull(null)).toBe('User');
      expect(formatPrivacyNameFromFull('')).toBe('User');
      expect(formatPrivacyNameFromFull(undefined)).toBe('User');
    });

    it('uses custom fallback', () => {
      expect(formatPrivacyNameFromFull('', 'N/A')).toBe('N/A');
    });
  });

  describe('getInitials', () => {
    it('returns initials from two-word name', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('returns single initial from one-word name', () => {
      expect(getInitials('Jane')).toBe('J');
    });

    it('returns "?" for empty string', () => {
      expect(getInitials('')).toBe('?');
    });

    it('handles privacy-formatted names', () => {
      expect(getInitials('John D.')).toBe('JD');
    });

    it('uppercases initials', () => {
      expect(getInitials('john doe')).toBe('JD');
    });
  });

  describe('getDateLabel', () => {
    it('returns "Today" for today\'s date', () => {
      const today = new Date().toISOString();
      expect(getDateLabel(today)).toBe('Today');
    });

    it('returns "Yesterday" for yesterday\'s date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(getDateLabel(yesterday.toISOString())).toBe('Yesterday');
    });

    it('returns formatted date for older dates', () => {
      const oldDate = '2024-01-15T12:00:00Z';
      const label = getDateLabel(oldDate);
      expect(label).toContain('Jan');
      expect(label).toContain('15');
      expect(label).toContain('2024');
    });
  });
});
