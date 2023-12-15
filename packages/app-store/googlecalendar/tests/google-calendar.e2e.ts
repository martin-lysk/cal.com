import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import dayjs from "@calcom/dayjs";
import { ensureAvailableUsers } from "@calcom/features/bookings/lib/handleNewBooking";
import { APP_CREDENTIAL_SHARING_ENABLED } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import type { CredentialPayload } from "@calcom/types/Credential";
import { test } from "@calcom/web/playwright/lib/fixtures";
import { selectSecondAvailableTimeSlotNextMonth } from "@calcom/web/playwright/lib/testUtils";

import metadata from "../_metadata";
import GoogleCalendarService from "../lib/CalendarService";
import { createBookingAndFetchGCalEvent, deleteBookingAndEvent, assertValueExists } from "./testUtils";

test.describe("Google Calendar", async () => {
  test.describe("Test using the primary calendar", async () => {
    let qaUsername: string;
    let qaGCalCredential: CredentialPayload;
    test.beforeAll(async () => {
      let runIntegrationTest = false;
      let errorMessage = "Could not run test";

      test.skip(!!APP_CREDENTIAL_SHARING_ENABLED, "Credential sharing enabled");

      if (process.env.E2E_TEST_CALCOM_GCAL_KEYS) {
        const gCalKeys = JSON.parse(process.env.E2E_TEST_CALCOM_GCAL_KEYS);
        await prisma.app.update({
          where: {
            slug: "google-calendar",
          },
          data: {
            keys: gCalKeys,
          },
        });
      } else {
        test.skip(!process.env.E2E_TEST_CALCOM_GCAL_KEYS, "GCal keys not found");
      }

      test.skip(!process.env.E2E_TEST_CALCOM_QA_EMAIL, "QA email not found");
      test.skip(!process.env.E2E_TEST_CALCOM_QA_PASSWORD, "QA password not found");

      if (process.env.E2E_TEST_CALCOM_QA_EMAIL && process.env.E2E_TEST_CALCOM_QA_PASSWORD) {
        qaGCalCredential = await prisma.credential.findFirstOrThrow({
          where: {
            user: {
              email: process.env.E2E_TEST_CALCOM_QA_EMAIL,
            },
            type: metadata.type,
          },
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        });
        if (!qaGCalCredential) errorMessage = "QA credential not found";
        // test.skip(!qaGCalCredential, "Google QA credential not found");

        const qaUserQuery = await prisma.user.findFirstOrThrow({
          where: {
            email: process.env.E2E_TEST_CALCOM_QA_EMAIL,
          },
          select: {
            id: true,
            username: true,
          },
        });

        const qaEventType = await prisma.eventType.findFirst({
          where: {
            slug: "15min",
            userId: qaUserQuery.id,
          },
          include: {
            users: true,
          },
        });

        if (!qaUserQuery) errorMessage = "QA user not found";
        // test.skip(!qaUserQuery, "QA user not found");

        assertValueExists(qaUserQuery.username, "qaUsername");
        qaUsername = qaUserQuery.username;

        if (!qaUsername) errorMessage = "QA username not found";
        // test.skip(!qaUsername, "QA username not found");

        const googleCalendarService = new GoogleCalendarService(qaGCalCredential);

        const calendars = await googleCalendarService.listCalendars();
        console.log("🚀 ~ file: google-calendar.e2e.ts:83 ~ test.beforeAll ~ calendars:", calendars);

        const primaryCalendarName = calendars.find((calendar) => calendar.primary)?.name;
        assertValueExists(primaryCalendarName, "primaryCalendarName");

        const users = await ensureAvailableUsers(qaEventType, {
          dateFrom: "2023-12-15T05:30:00-05:00",
          dateTo: "2023-12-15T06:00:00-05:00",
          timeZone: "America/Toronto",
          originalRescheduledBooking: null,
        });
        console.log("🚀 ~ file: google-calendar.e2e.ts:105 ~ test.beforeAll ~ users:", users);

        // const selectedCalendar = await prisma.selectedCalendar.upsert({
        //   where: {
        //     userId: qaUserQuery.id,
        //     integration: "google_calendar",
        //     externalId: primaryCalendarName,
        //   },
        //   update: {},
        //   create: {
        //     integration: "google_calendar",
        //     userId: qaUserQuery.id,
        //     externalId: primaryCalendarName,
        //     credentialId: qaGCalCredential.id,
        //   },
        // });

        const destinationCalendar = await prisma.destinationCalendar.upsert({
          where: {
            userId: qaUserQuery.id,
            externalId: primaryCalendarName,
            eventTypeId: undefined,
          },
          update: {},
          create: {
            integration: "google_calendar",
            userId: qaUserQuery.id,
            externalId: primaryCalendarName,
            credentialId: qaGCalCredential.id,
          },
        });
        console.log(
          "🚀 ~ file: google-calendar.e2e.ts:117 ~ test.beforeAll ~ destinationCalendar:",
          destinationCalendar
        );

        // const selectedCalendar = await prisma.selectedCalendar.findMany({
        //   where: {
        //     userId: qaUserQuery.id,
        //   },
        // });

        if (qaGCalCredential && qaUsername) runIntegrationTest = true;
      }

      test.skip(!runIntegrationTest, errorMessage);
    });

    // test.beforeEach(async ({ page, users }) => {
    //   assertValueExists(process.env.E2E_TEST_CALCOM_QA_EMAIL, "qaEmail");

    //   const qaUserStore = await users.set(process.env.E2E_TEST_CALCOM_QA_EMAIL);

    //   await qaUserStore.apiLogin(process.env.E2E_TEST_CALCOM_QA_PASSWORD);

    //   // Need to refresh keys from DB
    //   const refreshedCredential = await prisma.credential.findFirst({
    //     where: {
    //       id: qaGCalCredential?.id,
    //     },
    //     include: {
    //       user: {
    //         select: {
    //           email: true,
    //         },
    //       },
    //     },
    //   });
    //   assertValueExists(refreshedCredential, "refreshedCredential");

    //   const googleCalendarService = new GoogleCalendarService(refreshedCredential);

    //   const calendars = await googleCalendarService.listCalendars();

    //   const primaryCalendarName = calendars.find((calendar) => calendar.primary)?.name;
    //   assertValueExists(primaryCalendarName, "primaryCalendarName");

    //   await page.goto("/apps/installed/calendar");

    //   await page.waitForSelector('[title*="Create events on"]');
    //   await page.locator('[data-testid="default-calendar-selector"]').click();
    //   await page.locator(`.react-select__option:text("${primaryCalendarName}")`).click();
    //   // await page.locator('[title*="Create events on"]').locator("svg").click();
    //   // await page.click(".react-select__option", { text: primaryCalendarName });
    //   // await page.locator("#react-select-2-option-0-0").getByText(primaryCalendarName).click();
    // });

    test("On new booking, event should be created on GCal", async ({ page }) => {
      const { gCalEvent, gCalReference, booking, authedCalendar } = await createBookingAndFetchGCalEvent(
        page as Page,
        qaGCalCredential,
        qaUsername
      );

      assertValueExists(gCalEvent.start?.timeZone, "gCalEvent");
      assertValueExists(gCalEvent.end?.timeZone, "gCalEvent");

      // Ensure that the start and end times are matching
      const startTimeMatches = dayjs(booking.startTime).isSame(
        dayjs(gCalEvent.start.dateTime).tz(gCalEvent.start.timeZone)
      );
      const endTimeMatches = dayjs(booking.endTime).isSame(
        dayjs(gCalEvent.end?.dateTime).tz(gCalEvent.end.timeZone)
      );
      expect(startTimeMatches && endTimeMatches).toBe(true);

      // Ensure that the titles are matching
      expect(booking.title).toBe(gCalEvent.summary);

      // Ensure that the attendee is on the event
      const bookingAttendee = booking?.attendees[0].email;
      const attendeeInGCalEvent = gCalEvent.attendees?.find((attendee) => attendee.email === bookingAttendee);
      expect(attendeeInGCalEvent).toBeTruthy();

      await deleteBookingAndEvent(authedCalendar, booking.uid, gCalReference.uid);
    });

    test("On reschedule, event should be updated on GCal", async ({ page }) => {
      // Reschedule the booking and check the gCalEvent's time is also changed
      // On reschedule gCal UID stays the same
      const { gCalReference, booking, authedCalendar } = await createBookingAndFetchGCalEvent(
        page,
        qaGCalCredential,
        qaUsername
      );

      await page.locator('[data-testid="reschedule-link"]').click();

      await selectSecondAvailableTimeSlotNextMonth(page);
      await page.locator('[data-testid="confirm-reschedule-button"]').click();

      await expect(page.locator("[data-testid=success-page]")).toBeVisible();

      const rescheduledBookingUrl = await page.url();
      const rescheduledBookingUid = rescheduledBookingUrl.match(/booking\/([^\/?]+)/);

      assertValueExists(rescheduledBookingUid, "rescheduledBookingUid");

      // Get the rescheduled booking start and end times
      const rescheduledBooking = await prisma.booking.findFirst({
        where: {
          uid: rescheduledBookingUid[1],
        },
        select: {
          startTime: true,
          endTime: true,
        },
      });
      assertValueExists(rescheduledBooking, "rescheduledBooking");

      // The GCal event UID persists after reschedule but should get the rescheduled data
      const gCalRescheduledEventResponse = await authedCalendar.events.get({
        calendarId: "primary",
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        eventId: gCalReference.uid,
      });

      expect(gCalRescheduledEventResponse.status).toBe(200);

      const rescheduledGCalEvent = gCalRescheduledEventResponse.data;

      assertValueExists(rescheduledGCalEvent.start?.timeZone, "rescheduledGCalEvent");
      assertValueExists(rescheduledGCalEvent.end?.timeZone, "rescheduledGCalEvent");

      // Ensure that the new start and end times are matching
      const rescheduledStartTimeMatches = dayjs(rescheduledBooking.startTime).isSame(
        dayjs(rescheduledGCalEvent.start?.dateTime).tz(rescheduledGCalEvent.start?.timeZone)
      );
      const rescheduledEndTimeMatches = dayjs(rescheduledBooking.endTime).isSame(
        dayjs(rescheduledGCalEvent.end?.dateTime).tz(rescheduledGCalEvent.end.timeZone)
      );
      expect(rescheduledStartTimeMatches && rescheduledEndTimeMatches).toBe(true);

      // After test passes we can delete the bookings and GCal event
      await deleteBookingAndEvent(authedCalendar, booking.uid, gCalReference.uid);

      await prisma.booking.delete({
        where: {
          uid: rescheduledBookingUid[1],
        },
      });
    });

    test("When canceling the booking, the GCal event should also be deleted", async ({ page }) => {
      const { gCalReference, booking, authedCalendar } = await createBookingAndFetchGCalEvent(
        page,
        qaGCalCredential,
        qaUsername
      );

      // Cancel the booking
      await page.locator('[data-testid="cancel"]').click();
      await page.locator('[data-testid="confirm_cancel"]').click();
      // Query for the bookingUID and ensure that it doesn't exist on GCal

      await page.waitForSelector('[data-testid="cancelled-headline"]');

      const canceledGCalEventResponse = await authedCalendar.events.get({
        calendarId: "primary",
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        eventId: gCalReference.uid,
      });

      expect(canceledGCalEventResponse.data.status).toBe("cancelled");

      // GCal API sees canceled events as already deleted
      await deleteBookingAndEvent(authedCalendar, booking.uid);
    });
  });
});
