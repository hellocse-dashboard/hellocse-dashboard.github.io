// The composition root of the board of the reviews (reviews.html), a page apart from the dashboard for the whole dev
// team: the only module of it that runs anything when loaded, and nothing of the dashboard loads with it. It translates
// the page, wires its listeners, then opens the board with the key this browser kept, else asks for the team's password.
//
// Layers, as for the dashboard (app.js): domain/, model/, services/, ui/, then the page itself (pages/reviews/).

import { setupReviews, startReviews } from './pages/reviews/reviews.js'
import { markReviewsVisited } from './services/reviews-source.js'
import { translatePage } from './ui/translate.js'

// From now on, the dashboard's address leads this browser here, until it unlocks the dashboard.
markReviewsVisited()
translatePage()
setupReviews()
await startReviews()
