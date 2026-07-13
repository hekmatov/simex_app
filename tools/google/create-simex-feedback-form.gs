/**
 * Creates a SimEx Dashboard feedback Google Form in the signed-in Google account.
 *
 * How to use:
 * 1. Open https://script.google.com/
 * 2. Create a new Apps Script project.
 * 3. Paste this file into Code.gs.
 * 4. Run createSimExDashboardFeedbackForm().
 * 5. Authorize the script when Google asks.
 * 6. Copy the printed publishedUrl into public/config/dashboard.json as feedbackUrl.
 */
function createSimExDashboardFeedbackForm() {
  const form = FormApp.create("SimEx Dashboard V2 feedback");
  form.setDescription(
    [
      "Use this form to report dashboard bugs, data issues, usability problems, or feature requests.",
      "Please avoid entering sensitive personal information. Screenshots are optional but useful when they do not contain confidential content.",
    ].join("\n\n"),
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage("Thank you. Your dashboard feedback has been recorded.");

  form.addMultipleChoiceItem()
    .setTitle("Feedback type")
    .setRequired(true)
    .setChoiceValues([
      "Bug report",
      "Feature request",
      "Data issue",
      "Usability / design feedback",
      "Other",
    ]);

  form.addTextItem()
    .setTitle("Dashboard page or tab")
    .setHelpText("Example: Home, Biomedical, Socio-economic, Testing.")
    .setRequired(false);

  form.addTextItem()
    .setTitle("Chart, panel, or feature")
    .setHelpText("Name the chart/panel if the feedback is about a specific item.")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("What happened or what would you like changed?")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("What did you expect to happen?")
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle("Priority")
    .setRequired(false)
    .setChoiceValues([
      "Low - cosmetic or minor improvement",
      "Medium - affects interpretation or workflow",
      "High - blocks use during an exercise",
      "Critical - incorrect or misleading information",
    ]);

  form.addTextItem()
    .setTitle("Browser and device")
    .setHelpText("Example: Chrome on Windows laptop, Edge on tablet.")
    .setRequired(false);

  form.addTextItem()
    .setTitle("Dashboard URL")
    .setHelpText("Paste the page URL if available.")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("Optional contact details")
    .setHelpText("Leave blank if you do not want follow-up.")
    .setRequired(false);

  const destination = SpreadsheetApp.create("SimEx Dashboard V2 feedback responses");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, destination.getId());

  Logger.log("Edit URL: " + form.getEditUrl());
  Logger.log("Published URL: " + form.getPublishedUrl());
  Logger.log("Responses spreadsheet: " + destination.getUrl());

  return {
    editUrl: form.getEditUrl(),
    publishedUrl: form.getPublishedUrl(),
    spreadsheetUrl: destination.getUrl(),
  };
}
