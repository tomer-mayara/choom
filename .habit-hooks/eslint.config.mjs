import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const functionLines = (max) => [
	"error",
	{ max, skipBlankLines: true, skipComments: true, IIFEs: true },
];

export default [
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsparser,
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			"max-lines-per-function": functionLines(60),
			"max-params": ["error", 5],
			complexity: ["error", 25],
			"max-depth": ["error", { max: 4 }],
			"max-lines": [
				"error",
				{ max: 500, skipBlankLines: true, skipComments: true },
			],
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			eqeqeq: ["error", "always"],
			"no-var": "error",
			"prefer-const": "error",
			"no-duplicate-imports": "error",
			"no-warning-comments": [
				"warn",
				{ terms: ["todo", "fixme", "xxx", "hack"], location: "anywhere" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/no-inferrable-types": "error",
		},
	},
	{
		files: ["**/*.tsx"],
		rules: {
			"max-lines-per-function": functionLines(120),
		},
	},
	{
		files: ["**/test/**", "**/tests/**", "**/scripts/**"],
		rules: {
			"max-lines-per-function": functionLines(200),
		},
	},
];
