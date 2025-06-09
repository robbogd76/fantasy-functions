/* eslint-disable linebreak-style */
/* eslint-disable require-jsdoc */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
require("dotenv").config();
const {fetchBootstrap, fetchElementSummary, fetchFixtures} =
    require("fpl-api");
const {getFirestore} = require("firebase-admin/firestore");
const admin = require("firebase-admin");


const serviceAccount = JSON.parse(
    Buffer.from(process.env.FB_SERVICE_ACCOUNT_BASE64,
        "base64").toString());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = getFirestore();

async function getGoalkeepers(teams, players) {
  functions.logger.log("Getting the goalkeepers for the teams");

  const goalkeepers = new Map();

  // eslint-disable-next-line no-unused-vars
  for (const [id, _team] of teams) {
    goalkeepers.set(id, []);
  }

  for (const player of players.values()) {
    if (player.position == "GKP") {
      const summary = await fetchElementSummary(player.id);
      goalkeepers.get(player.team_id).push(summary);
    }
  }

  return goalkeepers;
}

async function loadPlayers() {
  functions.logger.log("Loading all the players");

  const positions = new Map();
  const teams = new Map();
  const players = new Map();

  const data = await fetchBootstrap();

  for (const type of data.element_types) {
    positions.set(type.id, type.singular_name_short);
  }

  for (const team of data.teams) {
    teams.set(team.id, team.name);
  }

  for (const element of data.elements) {
    let points = (element.goals_scored * 2) +
        element.assists -
        element.red_cards -
        (2 * element.penalties_missed) -
        (2 * element.own_goals);

    if (positions[element.element_type] == "GKP") {
      points += (element.clean_sheets * 2) +
        (element.penalties_saved * 2);
    }

    let minutesPerPoint = 0;
    if (points > 0) {
      minutesPerPoint = element.minutes / points;
    }

    const player = {
      id: element.id.toString(),
      id_num: element.id,
      first_name: element.first_name,
      last_name: element.second_name,
      web_name: element.web_name,
      position: positions.get(element.element_type),
      team: teams.get(element.team),
      team_id: element.team,
      goals: element.goals_scored,
      own_goals: element.own_goals,
      assists: element.assists,
      red_cards: element.red_cards,
      penalties_missed: element.penalties_missed,
      penalties_saved: element.penalties_saved,
      clean_sheets: element.clean_sheets,
      minutes: element.minutes,
      minutes_per_point: minutesPerPoint,
      news: element.news,
      points: points,
    };
    players.set(element.id, player);

    db.collection("players").doc(player.id).set(player);
  }

  return {
    teams: teams,
    players: players,
    numPlayers: data.elements.length,
  };
}

async function loadMatches(data, goalkeepers) {
  functions.logger.log("Loading the matches");

  const fixtures = await fetchFixtures();

  const teams = data.teams;
  const players = data.players;

  for (const fixture of fixtures) {
    const match = {
      id: fixture.id.toString(),
      start_time: fixture.kickoff_time,
      home_team: teams.get(fixture.team_h),
      home_team_score: fixture.team_h_score,
      away_team: teams.get(fixture.team_a),
      away_team_score: fixture.team_a_score,
      goals: {
        home: [],
        away: [],
      },
      own_goals: {
        home: [],
        away: [],
      },
      assists: {
        home: [],
        away: [],
      },
      penalty_misses: {
        home: [],
        away: [],
      },
      penalty_saves: {
        home: [],
        away: [],
      },
      red_cards: {
        home: [],
        away: [],
      },
      clean_sheets: {
        home: [],
        away: [],
      },
    };

    for (const goal of fixture.stats[0].h) {
      const goalRecord = {
        player_last_name: players.get(goal.element).web_name,
        player_id: goal.element.toString(),
        value: goal.value,
      };
      match.goals.home.push(goalRecord);
    }

    for (const goal of fixture.stats[0].a) {
      const goalRecord = {
        player_last_name: players.get(goal.element).web_name,
        player_id: goal.element.toString(),
        value: goal.value,
      };
      match.goals.away.push(goalRecord);
    }

    for (const assist of fixture.stats[1].h) {
      const assistRecord = {
        player_last_name: players.get(assist.element).web_name,
        player_id: assist.element.toString(),
        value: assist.value,
      };
      match.assists.home.push(assistRecord);
    }

    for (const assist of fixture.stats[1].a) {
      const assistRecord = {
        player_last_name: players.get(assist.element).web_name,
        player_id: assist.element.toString(),
        value: assist.value,
      };
      match.assists.away.push(assistRecord);
    }

    for (const ownGoal of fixture.stats[2].h) {
      const ownGoalRecord = {
        player_last_name: players.get(ownGoal.element).web_name,
        player_id: ownGoal.element.toString(),
        value: ownGoal.value,
      };
      match.own_goals.home.push(ownGoalRecord);
    }

    for (const ownGoal of fixture.stats[2].a) {
      const ownGoalRecord = {
        player_last_name: players.get(ownGoal.element).web_name,
        player_id: ownGoal.element.toString(),
        value: ownGoal.value,
      };
      match.own_goals.away.push(ownGoalRecord);
    }

    match.own_goal_count = match.own_goals.home.length +
        match.own_goals.away.length;

    for (const savedPenalty of fixture.stats[3].h) {
      const savedPenaltyRecord = {
        player_last_name: players.get(savedPenalty.element).web_name,
        player_id: savedPenalty.element.toString(),
        value: savedPenalty.value,
      };
      match.penalty_saves.home.push(savedPenaltyRecord);
    }

    for (const savedPenalty of fixture.stats[3].a) {
      const savedPenaltyRecord = {
        player_last_name: players.get(savedPenalty.element).web_name,
        player_id: savedPenalty.element.toString(),
        value: savedPenalty.value,
      };
      match.penalty_saves.away.push(savedPenaltyRecord);
    }

    for (const missedPenalty of fixture.stats[4].h) {
      const missedPenaltyRecord = {
        player_last_name: players.get(missedPenalty.element).web_name,
        player_id: missedPenalty.element.toString(),
        value: missedPenalty.value,
      };
      match.penalty_misses.home.push(missedPenaltyRecord);
    }

    for (const missedPenalty of fixture.stats[4].a) {
      const missedPenaltyRecord = {
        player_last_name: players.get(missedPenalty.element).web_name,
        player_id: missedPenalty.element.toString(),
        value: missedPenalty.value,
      };
      match.penalty_misses.away.push(missedPenaltyRecord);
    }

    for (const redCard of fixture.stats[6].h) {
      const redCardRecord = {
        player_last_name: players.get(redCard.element).web_name,
        player_id: redCard.element.toString(),
        value: redCard.value,
      };
      match.red_cards.home.push(redCardRecord);
    }

    for (const redCard of fixture.stats[6].a) {
      const redCardRecord = {
        player_last_name: players.get(redCard.element).web_name,
        player_id: redCard.element.toString(),
        value: redCard.value,
      };
      match.red_cards.away.push(redCardRecord);
    }

    // Clean sheets are harder to find for the match info as
    // the API for fixtures doesn't return this info.
    // The player history API does return it.
    // We have pre loaded the player history for all of the
    // goalkeepers so we will use that.
    for (const summary of goalkeepers.get(fixture.team_h)) {
      for (const history of summary.history) {
        if (history.fixture == fixture.id &&
            history.clean_sheets == 1) {
          const cleanSheet = {
            player_last_name: players.get(
                parseInt(summary.id)).web_name,
            player_id: summary.id,
            value: 1,
          };
          match.clean_sheets.home.push(cleanSheet);
        }
      }
    }

    for (const summary of goalkeepers.get(fixture.team_a)) {
      for (const history of summary.history) {
        if (history.fixture == fixture.id &&
            history.clean_sheets == 1) {
          const cleanSheet = {
            player_last_name: players.get(
                parseInt(summary.id)).web_name,
            player_id: summary.id,
            value: 1,
          };
          match.clean_sheets.away.push(cleanSheet);
        }
      }
    }

    db.collection("matches").doc(match.id).set(match);
  }

  return fixtures.length;
}

async function loadFantasyData() {
  try {
    const data = await loadPlayers();
    functions.logger.log("Loaded " + data.numPlayers + " players.");
    const goalkeepers = await getGoalkeepers(data.teams, data.players);
    const numMatches = await loadMatches(data, goalkeepers);
    functions.logger.log("Loaded " + numMatches.toString() + " matches.");
  } catch (error) {
    functions.logger.error(error);
  }
}

exports.scheduledLoadFantasyData = onSchedule(
    "every day 00:00", async (_eventIgnored) => {
      functions.logger.log("Scheduled load of fantasy data");
      loadFantasyData();
    });

exports.callLoadFantasyData = functions.https.onCall(
    async (_dataIgnored, _contextIgnored) => {
      functions.logger.log("Adhoc load of fantasy data");
      await loadFantasyData();
      return {
        message: "Instantiated load of data",
      };
    });
