package e2e

import (
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/server/subsonic/responses"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// Integration tests for the "unfavorite / unstar" flow.
//
// Level 2 (Frontend <-> Backend): verifies that the unstar HTTP endpoint
// accepts the request and signals the frontend to update the UI.
//
// Level 3 (Frontend <-> Backend <-> Database): verifies that the unfavorite
// state is durable — a subsequent re-fetch (simulating a page reload) returns
// the song as not starred and absent from the favorites list.
var _ = Describe("Unfavorite Integration Tests", Ordered, func() {
	var songID string

	BeforeAll(func() {
		setupTestDB()

		songs, err := ds.MediaFile(ctx).GetAll(model.QueryOptions{Max: 1, Sort: "title"})
		Expect(err).ToNot(HaveOccurred())
		Expect(songs).ToNot(BeEmpty())
		songID = songs[0].ID
	})

	// Level 2: Frontend <-> Backend
	// The UI removes a song from favorites by calling the real backend.
	// Expected: the backend returns a success response so the frontend can
	// immediately flip the heart icon to "not starred".
	Describe("Level 2: UI removes song from favorites through real backend", Ordered, func() {
		BeforeAll(func() {
			// Pre-condition: the song must be starred before the unstar action.
			resp := doReq("star", "id", songID)
			Expect(resp.Status).To(Equal(responses.StatusOK))
		})

		AfterAll(func() {
			// Cleanup: leave the DB clean for subsequent specs.
			doReq("unstar", "id", songID)
		})

		It("returns a success response when unstarring a previously starred song", func() {
			// Act — simulate the user clicking the unstar/unfavorite button in the UI.
			resp := doReq("unstar", "id", songID)

			// Verify — the backend accepted the request; the frontend can update the UI.
			Expect(resp.Status).To(Equal(responses.StatusOK))
		})
	})

	// Level 3: Frontend <-> Backend <-> Database
	// After the user unstars a song, the state must survive a page reload.
	// Expected: a subsequent re-fetch of the favorites list does not include
	// the song that was just unstarred.
	Describe("Level 3: Unfavorite state persists after reload", Ordered, func() {
		BeforeAll(func() {
			// Pre-condition: the song must be starred before the unstar action.
			resp := doReq("star", "id", songID)
			Expect(resp.Status).To(Equal(responses.StatusOK))
		})

		AfterAll(func() {
			// Cleanup: ensure the song is not starred after this block.
			doReq("unstar", "id", songID)
		})

		It("song remains not favorite and does not appear in favorites after re-fetching", func() {
			// Act — unstar the song (user clicks unfavorite).
			resp := doReq("unstar", "id", songID)
			Expect(resp.Status).To(Equal(responses.StatusOK))

			// Simulate a page reload: issue a new getStarred request, exactly
			// as the frontend does when it re-fetches the favorites list.
			resp = doReq("getStarred")

			// Verify — the song is absent from the returned favorites list.
			Expect(resp.Status).To(Equal(responses.StatusOK))
			Expect(resp.Starred).ToNot(BeNil())
			starredIDs := make([]string, 0, len(resp.Starred.Song))
			for _, s := range resp.Starred.Song {
				starredIDs = append(starredIDs, s.Id)
			}
			Expect(starredIDs).ToNot(ContainElement(songID))
		})
	})
})
