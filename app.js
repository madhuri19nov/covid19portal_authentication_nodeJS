const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertstateDbobjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertdistrictDbobjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getStateQuery = ` 
        SELECT
          *
        FROM 
        state;
    `;
  const stateArray = await db.all(getStateQuery);
  response.send(
    stateArray.map((eachState) =>
      convertstateDbobjectToResponseObject(eachState)
    )
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const selectedStateQuery = `
        SELECT 
        * 
        FROM 
        state
        WHERE
        state_id = '${stateId}'    
  `;

  const stateQuery = await db.get(selectedStateQuery);
  response.send(convertstateDbobjectToResponseObject(stateQuery));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictDetails = `
    INSERT INTO 
        district (district_name, state_id, cases, cured, active, deaths) 
    VALUES(
        '${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths}
    ) 
    `;

  await db.run(postDistrictDetails);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDetails = `
        SELECT
         *
        FROM 
        district
        WHERE district_id= '${districtId}'
    `;

    const district = await db.get(getDistrictDetails);
    response.send(convertdistrictDbobjectToResponseObject(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictDetails = `
    DELETE 
    FROM 
    district
    WHERE district_id= '${districtId}'
  `;

    await db.run(deleteDistrictDetails);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetails = `
    UPDATE 
        district 
    SET 
        district_name = '${districtName}',
        state_id = ${stateId}, 
        cases =  ${cases}, 
        cured = ${cured}, 
        active =  ${active}, 
        deaths =${deaths}
    WHERE district_id= '${districtId}'
 `;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getTotalDetails = `
        SELECT 
          SUM(cases),
          SUM(cured),
          SUM(active),
          SUM(deaths)
        FROM 
            district
        WHERE 
            state_id = ${stateId}
      `;
    const stats = await db.get(getTotalDetails);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
