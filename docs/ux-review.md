# Usability review

The October 2026 review used [Nielsen Norman Group's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) for clear status, familiar language, user control, consistency, and error recovery. It also used [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for keyboard focus, text and non-text contrast, reflow, and pointer target guidance, and the [GOV.UK error-message guidance](https://design-system.service.gov.uk/components/error-message/) for specific, actionable messages. These are design references, not a claim of formal conformance.

## Findings and changes

- The phone header hid most destinations. A labeled menu now exposes the same destinations as desktop, closes with Escape, returns focus, and has an announced expanded state. A skip link supports keyboard navigation.
- Campaign and legacy searches did not distinguish an empty registry from no matches. Results now say what happened and offer a way back; experiment search offers a filter reset.
- Clipboard failures were silent and the selected agent was only indicated by color. The connect page announces copy success or an actionable failure and exposes the selection state. Commands wrap on narrow screens without changing the copied content.
- Small text and metadata made research records hard to read. Key supporting text, status labels, search controls, and footer contrast were increased, with explicit focus and target sizing.
- Private evidence controls appeared before the campaign introduction. The campaign now introduces the research before those optional controls. Token fields describe their accepted format and keep values out of URLs.
- A private experiment opened from a scrolled campaign could appear thousands of pixels below its heading. Detail views now open at their start, show loading feedback, and restore the previous campaign position and focus on return.
- At 320 CSS pixels, a long breadcrumb and measurement value extended beyond the content area. They now reflow or shorten without changing the underlying data.

## Verification

Use a production build and check the homepage, campaign, experiment, connect, private workspace, guidelines, legacy, and not-found routes at desktop and narrow viewport sizes. Check keyboard skip, mobile menu and Escape, searches with no matches, copy feedback, private token validation, and campaign-to-experiment navigation and return. Run `npm run build`, `npm run test:mcp`, `npm run test:campaigns`, and `npm run test:reproduction-status`; use only disposable labeled fixtures for private-record checks and remove them afterward. These checks do not replace testing with real users and assistive technologies.
