import { describe, expect, test as it } from 'bun:test';
import { renderTemplate } from '../../src/utils/template.js';

describe('renderTemplate', () => {
  describe('basic variable replacement', () => {
    it('should replace a single variable in a template', () => {
      const template = 'Hello {{userName}}!';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice!');
    });

    it('should replace multiple variables in a template', () => {
      const template = 'Hello {{userName}}, your file is at {{filePath}}';
      const variables = { userName: 'Alice', filePath: '/tmp/file.txt' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice, your file is at /tmp/file.txt');
    });

    it('should replace the same variable multiple times', () => {
      const template = "{{name}} likes {{name}}'s workspace in {{name}}'s folder";
      const variables = { name: 'Bob' };

      const result = renderTemplate(template, variables);

      expect(result).toBe("Bob likes Bob's workspace in Bob's folder");
    });
  });

  describe('case-insensitive variable matching', () => {
    it('should match variables with different casing (lowercase)', () => {
      const template = 'Hello {{username}}!';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice!');
    });

    it('should match variables with different casing (uppercase)', () => {
      const template = 'Hello {{USERNAME}}!';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice!');
    });

    it('should match variables with different casing (mixed case)', () => {
      const template = 'Hello {{UserName}}!';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice!');
    });

    it('should handle mixed case in both template and variables', () => {
      const template = '{{firstName}} {{LASTNAME}} works at {{CompanyName}}';
      const variables = { firstname: 'John', LastName: 'Doe', companyname: 'Acme Corp' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('John Doe works at Acme Corp');
    });
  });

  describe('empty and simple templates', () => {
    it('should return empty string for empty template', () => {
      const template = '';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('');
    });

    it('should return unchanged string when no variables present', () => {
      const template = 'Hello World!';
      const variables = { userName: 'Alice' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello World!');
    });

    it('should handle template with only text and no placeholders', () => {
      const template = 'This is a plain text template with no variables';
      const variables = {};

      const result = renderTemplate(template, variables);

      expect(result).toBe('This is a plain text template with no variables');
    });
  });

  describe('edge cases', () => {
    it('should handle variables with underscores', () => {
      const template = 'User {{user_name}} has role {{user_role}}';
      const variables = { user_name: 'Alice', user_role: 'admin' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('User Alice has role admin');
    });

    it('should handle adjacent variables without spaces', () => {
      const template = '{{firstName}}{{lastName}}';
      const variables = { firstName: 'John', lastName: 'Doe' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('JohnDoe');
    });

    it('should handle empty string as variable value', () => {
      const template = 'Hello {{userName}}!';
      const variables = { userName: '' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello !');
    });
  });

  describe('error handling', () => {
    it('should throw error when variable is not provided', () => {
      const template = 'Hello {{userName}}!';
      const variables = {};

      expect(() => renderTemplate(template, variables)).toThrow(
        "Template variable 'userName' is not provided in the variables object",
      );
    });

    it('should throw error when only some variables are provided', () => {
      const template = '{{firstName}} {{lastName}}';
      const variables = { firstName: 'John' };

      expect(() => renderTemplate(template, variables)).toThrow(
        "Template variable 'lastName' is not provided in the variables object",
      );
    });
  });
});
