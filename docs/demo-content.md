# Demo workspace content

Start **Competition Demo** from `/competition-demo`, or use **Reset demo** in an existing demo. The reset restores the synthetic student's portfolio, CV analyses, evidence, study documents and imported calendar events alongside the existing scenario. No personal CV or real student record is used.

The workspace includes three projects with completeness checks and improvement suggestions, two downloadable PDF CVs with parsed sections and completed analyses, two sample certificates with photo previews, and three processed learning documents with source references, flashcards and quizzes. The university timetable includes three imported events and two completed sync runs; the second run skips unchanged events. Imported events also appear in Planner. Certificates stay self-declared, and missing project skills do not become evidence.

All source files are in `public/demo/`: CV PDFs and text in `cvs/`, learning PDFs and text in `learning/`, `university-calendar.ics`, certificate photos in `certificates/`, and the portrait in `profile/sachith.png`.

Run `npm run demo:assets` to regenerate PDFs after editing the text sources. Run `npm run demo:seed` to add this content to the ordinary `student-sachith` demo owner; repeated calls reuse existing sample records. The competition reset calls the same seeder automatically. Seeding is restricted to development, demo and test environments and the two synthetic owners. Sample imports use the existing manual calendar workflow and do not connect to a real provider account.

## Image assets

Generated using the built-in imagegen tool. Final saved paths:

- `public/demo/profile/sachith.png`
- `public/demo/certificates/git-release-automation.png`
- `public/demo/certificates/docker-foundations.png`

Final portrait prompt:

> Use case: photorealistic-natural. Asset type: profile picture for a synthetic demo student named Sachith in a career-learning application. Create a professional, natural head-and-shoulders portrait of a fictional Sri Lankan male computer science student in his early twenties, short dark hair, warm approachable expression, wearing a simple dark teal collared shirt. Plain softly lit pale warm grey studio background. Square composition with the whole head and shoulders centered, generous margin suitable for a circular avatar crop. Natural skin texture, soft daylight. No text, no logos. Save the generated image as a project asset.

Final certificate prompt template (one image per row below):

> Use case: product-mockup. Asset type: certificate photo for a fictional student's demo evidence gallery. Create a realistic high resolution landscape photo of a professionally designed completion certificate on ivory textured paper, lying flat on a pale neutral desk, slight natural shadow, perfectly readable. Restrained navy and teal border, small gold embossed geometric seal. Text exactly: "LUMA LEARNING ACADEMY", "CERTIFICATE OF COMPLETION", "Sachith", "{title}", "Completed {date}", "Credential: {reference}", "SAMPLE • DEMO CERTIFICATE". Make the demo label clearly legible. Elegant typography, generous whitespace, front facing nearly orthographic composition with the entire paper visible. Fictional issuer, no real brand logos, no fraudulent real signatures, no additional objects.

| Title | Date | Reference |
| --- | --- | --- |
| Git & Release Automation | 18 September 2026 | DEMO-GIT-2026-018 |
| Docker Foundations | 24 September 2026 | DEMO-DOCKER-2026-024 |
