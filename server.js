const express = require('express');
const axios = require('axios');
const { initialize, isEnabled } = require('unleash-client');
const {Client} = require('pg');
const winston = require('winston');
const PORT = 8100;
const app = express();

// Middleware to set Access-Control-Allow-Origin header
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' }),
  ],
});
const clientpg = {
    user : "postgres",
    database : "postgres",
    host : "127.0.0.1",
    port : 5432,
    password : "Softjuandius_25"
}

const client = new Client(clientpg);
client.connect();


// First step, get lat and lon of a place
const URI_LOCATION = "https://nominatim.openstreetmap.org/search"; // Params: q=place&format=json (returns array of objects, get the first one)

// Second step, get weather of a place (hourly and daily)
const URI_WEATHER = "https://api.open-meteo.com/v1/forecast"; // Params: latitude, longitude, forecast_days  (if daily param), daily|hourly, timezone

// Third step, get restaurants near the place (+- 0.01 lat and lon)
const URI_NEAR = "https://api.openstreetmap.org/api/0.6/map"; // Params: bbox (min_lon, min_lat, max_lon, max_lat), returns xml (osm)

// Unleash configuration
const URI_GEOCODING = "https://geocoding-api.open-meteo.com/v1/search?";
const unleashConfig = {
  appName: 'task',
  url: 'http://localhost:4242/api/',
  customHeaders: {
    Authorization : '*:development.3dd388362c9ddf9a13ae5353ee646ea1c42da802317b33fa2b8409c5'
  }
};

initialize(unleashConfig);

// Feature toggle function
function isFeatureEnabled(featureName,options) {
    // console.log("Llamado a la funcion");
   return isEnabled(featureName, options); 
}



app.get('/weather/:place/:user', async (req, res) => {
    try {
        const place = req.params.place;
        const user= req.params.user;
        const pais = await client.query(`select pais from p4 where nombre = $1`,[user]);
        console.log(pais.rows[0].pais);
        const options = {"region" : pais.rows[0].pais};
        // console.log(place);
        if (!isFeatureEnabled('task',options)){

            // const response = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${pais}`);
            // console.log("Termina");
            // res.send({"SEGUNDA API" : "GEOCODING","response": response.data});
            logger.info(`[${new Date().toLocaleString()}] Feature 'task' is not enabled for user ${user}`);
            res.send("Sigue disfrutando de la app!");
            // console.log(response.data.results);
        }else
        {
            logger.info(`[${new Date().toLocaleString()}] Feature 'task' is enabled for user ${user}`);
            const reliability = await client.query(`select * from restaurantes where ciudad = $1`,[place]);
            if(reliability.rows.length === 0){
                logger.info(`[${new Date().toLocaleString()}] Inserting city ${place} in DataBase`);
                const locationParams = {
                    q: place,
                    format: 'json'
                };
                const locationResponse = await axios.get(URI_LOCATION, { params: locationParams });
                const { lat, lon } = locationResponse.data[0];
                // const weatherParams = {
                //     latitude: lat,
                //     longitude: lon,
                //     daily: 'temperature_2m_max',
                //     forecast_days: 3,
                //     timezone: 'PST'
                // };
                // const weatherResponse = await axios.get(URI_WEATHER, { params: weatherParams });
                // console.log("2");
                const nearbyParams = {
                    bbox: `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`
                };
                const nearbyResponse = await axios.get(URI_NEAR, { params: nearbyParams });
                // console.log("3");
                const restaurants = nearbyResponse.data.elements
                    .filter(element => element.tags && element.tags.amenity === 'restaurant')
                    .map(element => ({
                        name: element.tags.name,
                        location: {
                            latitude: element.lat,
                            longitude: element.lon
                        }
                    }));
                const lista_restaurante = [];    
                // restaurants.map(restaurante => (
                //     lista_restaurante.push(restaurante.filter(restaurante.name))
                // ));
                restaurants.filter(restaurante => restaurante.name)
                .map(restaurante =>{
                    lista_restaurante.push(restaurante.name);
                })
                // console.log(lista_restaurante)
                await client.query(`INSERT INTO restaurantes (ciudad, restaurantes) VALUES ($1, $2)`,[place,lista_restaurante]);
                res.json({
                    // weather: weatherResponse.data,
                    Restaurantes : lista_restaurante
                });
                // console.log(`Weather and nearby restaurants for ${place} sent`);
            }
            else
            {
                logger.info(`[${new Date().toLocaleString()}] Getting data of city ${place} from DataBase`);
                const response = await client.query(`SELECT restaurantes FROM restaurantes WHERE ciudad = $1`,[place]);
                // console.log(response);
                res.send(response.rows);
            }

        }
    } catch (error) {
        logger.error(`Error processing request: ${error.message}`);
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
