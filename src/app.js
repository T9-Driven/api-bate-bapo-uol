import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'
import utf8 from 'utf8'

dotenv.config()

const participantsSchema = joi.object({
  name: joi.string().required().min(3)
})

const messagesSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required().valid("message", "private_message")
})

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect()
  db = mongoClient.db()
} catch (error) {
  console.error(error)
  console.log('Deu zica na conexão com o banco de dados')
}

const app = express()
app.use(cors())
app.use(express.json())

app.get("/participants", async (req, res) => {
  try {
    const result = await db.collection("participants").find().toArray()

    if (!result) return res.status(404).send("Não foram encontrados usuários")

    res.send(result)
  } catch (error) {
    console.error(error)
    res.status(500).send('Deu pau no banco de dados')
  }
})

app.post("/participants", async (req, res) => {
  const { name } = req.body

  const { error } = participantsSchema.validate({ name })

  if (error) return res.status(422).send()

  try {
    const participantExists = await db.collection("participants").findOne({ name })

    if (participantExists) return res.status(409).send('Usuário duplicado')

    await db.collection("participants").insertOne({ name, lastStatus: Date.now() })

    await db.collection("messages").insertOne({
      from: name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs().format("HH:mm:ss")
    })

    res.status(201).send("OK")

  } catch (error) {
    res.status(500).send("Houve um problema no servidor!")
  }

})

app.get("/messages", async (req, res) => {
  const { user } = req.headers
  const limit = req.query.limit

  if (isNaN(limit) && limit || parseInt(limit) <= 0) return res.sendStatus(422)

  try {

    const messages = await db.collection("messages").find({
      $or: [
        { from: user },
        { to: { $in: [user, "Todos"] } },
        { type: "message" }
      ]
    }).limit(Number(limit)).toArray()

    res.send(messages)

  } catch (error) {
    console.error(error)
    res.status(500).send("Zicou bonito o servidor!!")
  }
})

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body
  const { user } = req.headers

  const { error, value: newMessage } = messagesSchema.validate({ to, text, type, from: user }, { abortEarly: false })

  if (error) {
    const err = error.details.map((e) => e.message)
    return res.status(422).send(err)
  }

  try {
    const userExists = await db.collection('participants').findOne({ name: utf8.decode(user) })

    if (!userExists) return res.status(422).send()


    await db.collection('messages').insertOne({ ...newMessage, time: dayjs().format("HH:mm:ss") })

    res.sendStatus(201)
  } catch (error) {
    res.status(500).send("Deu xabu no banco de dados")
  }


})

app.put("/status", async (req, res) => {
  const { user } = req.headers

  try {
    const userExists = await db.collection("participants").findOne({ name: user })

    if (!userExists) return res.sendStatus(404)

    await db.collection("participants").updateOne(
      { name: user },
      { $set: { lastStatus: Date.now() } }
    )

    res.sendStatus(200)

  } catch (error) {
    console.log(error)
    res.status(500).send('Zicou o db')
  }
})

setInterval(async () => {

  const tenSecondsAgo = Date.now() - 10000

  try {

    const participantInactives = await db.collection("participants")
      .find({ lastStatus: { $lte: tenSecondsAgo } }).toArray()

    if (participantInactives.length > 0) {
      const inactiveMessages = participantInactives.map((participant) => {
        return {
          from: participant.name,
          to: 'Todos',
          text: 'sai da sala...',
          type: 'status',
          time: dayjs().format("HH:mm:ss")
        }
      })

      await db.collection("messages").insertMany(inactiveMessages)
      await db.collection("participants").deleteMany(
        { lastStatus: { $lte: tenSecondsAgo } }
      )
    }

  } catch (error) {
    console.error(error)
    res.status(500).send("Deu pau no db no setInterval")
  }

}, 15000)


const PORT = 5008

app.listen(PORT, () => console.log('Servidor rodou suave demais!!'))