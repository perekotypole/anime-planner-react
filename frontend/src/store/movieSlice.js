import axios from 'axios'
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { isSameMonth } from 'date-fns'

import MoviesService from '../services/movies.service'

const requestGetById = async (id, episodes = false) => {
  const promise = axios.post('https://api.myshows.me/v2/rpc/', {
    jsonrpc: '2.0',
    method: 'shows.GetById',
    params: {
      showId: id,
      withEpisodes: episodes,
    },
    id: 1,
  })

  const element = await Promise.resolve((await promise).data)

  const key = '1914a82a'
  const { imdbUrl } = element.result
  let poster = ''

  if (imdbUrl) {
    const imdbID = imdbUrl.split('/')[4]
    const promisePoster = axios.get(`http://omdbapi.com/?apikey=${key}&i=${imdbID}`)

    poster = await Promise.resolve((await promisePoster).data.Poster)
    if (!poster || poster === 'N/A') poster = element.result.image
  } else {
    poster = element.result.image
  }

  const result = {
    poster,
    ...element.result,
  }

  return result
}

const requestSearch = async (query) => {
  const promise = axios.post('https://api.myshows.me/v2/rpc/', {
    jsonrpc: '2.0',
    method: 'shows.Get',
    params: {
      search: {
        genre: 29,
        query,
      },
      page: 0,
      pageSize: 30,
    },
    id: 1,
  })

  const elements = await Promise.resolve((await promise).data)

  const { result } = elements
  return result
}

const getPlannerListFunction = async (list) => {
  const plannerData = await MoviesService.getPlanner()
  if (plannerData.errors) return false

  const planner = await Promise.all(plannerData.result[list]
    .map(({ _id, movieID, text }) => {
      if (text) {
        return ({
          id: movieID || _id,
          title: text,
        })
      }

      return requestGetById(movieID)
    }))
    .then((elements) => elements)

  return [list, planner]
}

export const getSubscribes = createAsyncThunk(
  'movies/getSubscribes',
  async () => {
    const subscribesData = await MoviesService.getSubscribes()
    if (subscribesData.errors) return false

    if (subscribesData.result.list) {
      const subscribes = Promise.all(subscribesData.result.list
        .map(({ movieID }) => requestGetById(movieID)))
        .then((elements) => elements)
      return subscribes
    }

    return false
  },
)

export const getSchedule = createAsyncThunk(
  'movies/getSchedule',
  async (date = new Date()) => {
    const subscribesData = await MoviesService.getSubscribes()

    if (subscribesData.result.list) {
      const schedule = Promise.all(subscribesData.result.list
        .map(({ movieID }) => requestGetById(movieID, true)))
        .then((elements) => elements.map((element) => {
          const episodes = element.episodes.filter(
            (episode) => isSameMonth(date, new Date(episode.airDate)),
          )

          const result = episodes.map((episode) => ({
            ...episode,
            info: element,
          }))
          return result
        }))
      return schedule
    }

    return null
  },
)

export const getPlannerList = createAsyncThunk(
  'movies/getPlannerList',
  async (list) => {
    const result = await getPlannerListFunction(list)
    return result
  },
)

export const getSearch = createAsyncThunk(
  'movies/getSearch',
  async (query) => {
    const search = []

    if (query) {
      const searchResult = await requestSearch(query)
      const { result: { list: subscribesData } } = await MoviesService.getSubscribes()

      const searchPromise = Promise.all(searchResult
        .map(({ id }) => requestGetById(id)))
        .then((elements) => {
          if (!subscribesData.length) return elements

          return (elements.map(
            (item) => {
              let checked = false
              subscribesData.forEach(({ movieID }) => { if (movieID === item.id) checked = true })

              return {
                checked,
                ...item,
              }
            },
          ))
        })
      search.push(...(await searchPromise))
    }

    return search
  },
)

export const addSubscribe = createAsyncThunk(
  'movies/addSubscribe',
  async (id) => {
    const itemExist = await requestGetById(id)
    let result = false

    if (itemExist) {
      result = await MoviesService.addSubscribe(id)
      if (result.errors) return false

      if (result.result.list) {
        const subscribes = Promise.all(result.result.list
          .map(({ movieID }) => requestGetById(movieID)))
          .then((elements) => elements)
        return subscribes
      }
    }

    return false
  },
)

export const removeSubscribe = createAsyncThunk(
  'movies/removeSubscribe',
  async (id) => {
    const result = await MoviesService.removeSubscribe(id)
    if (result.errors) return false

    if (Array.isArray(result.result.list)) {
      const subscribes = Promise.all(result.result.list
        .map(({ movieID }) => requestGetById(movieID)))
        .then((elements) => elements)
      return subscribes
    }

    return false
  },
)

export const addItemToPlanner = createAsyncThunk(
  'movies/addItemToPlanner',
  async ({ list, id }) => {
    const itemExist = await requestGetById(id)
    let result = false

    if (itemExist) {
      const data = await MoviesService.addToPlanner(list, id)
      if (data.errors) return false

      result = []
      result.push(await getPlannerListFunction(data.addTo))
      if (data.removeFrom) {
        result.push(await getPlannerListFunction(data.removeFrom))
      }

      // if (result[data.addTo].errors || result[data.removeFrom].errors) return false

      return result
    }

    return false
  },
)

export const chengePlannerList = createAsyncThunk(
  'movies/chengePlannerList',
  async ({ listName, list }) => {
    const formatedList = list.map((item) => ({
      movieID: item.id,
    }))

    const plannerData = await MoviesService.chengePlannerList(listName, formatedList)
    if (plannerData.errors) return false

    const planner = await Promise.all(plannerData.result[listName]
      .map(({ _id, movieID, text }) => {
        if (text) {
          return ({
            id: movieID || _id,
            title: text,
          })
        }

        return requestGetById(movieID)
      }))
      .then((elements) => elements)

    return [list, planner]
  },
)

export const removePlannerItem = createAsyncThunk(
  'movies/removePlannerItem',
  async ({ listName, movieID }) => {
    const result = await MoviesService.deletePlannerList(listName, movieID)
    if (result.errors) return false

    const list = await getPlannerListFunction(listName)
    return list
  },
)

const movieSlice = createSlice({
  name: 'movies',
  initialState: {
    subscribes: [],
    schedule: [],
    search: [],
    searchStatus: null,
    planner: {
      completed: [],
      dropped: [],
      onHold: [],
      plan: [],
      watching: [],
    },
    plannerChanged: {
      value: false,
      sourceList: null,
      destinationList: null,
    },
  },
  extraReducers: {
    [getSubscribes.fulfilled]: (state, action) => {
      state.subscribes = []
      if (action.payload) state.subscribes.push(...(action.payload))
    },
    [getSchedule.fulfilled]: (state, action) => {
      state.schedule = []
      if (action.payload) state.schedule.push(...(action.payload.flat()))
    },
    [getSearch.fulfilled]: (state, action) => {
      state.searchStatus = ''
      state.search = []
      if (action.payload) state.search.push(...(action.payload))
    },
    [getSearch.pending]: (state) => {
      state.searchStatus = 'Loading'
    },
    [getPlannerList.fulfilled]: (state, action) => {
      const [list, result] = action.payload
      if (action.payload) {
        state.planner[list] = []
        state.planner[list].push(...result)
      }
    },
    [chengePlannerList.fulfilled]: (state, action) => {
      if (action.payload) {
        const [list, result] = action.payload
        state.planner[list] = []
        state.planner[list].push(...result)

        state.plannerChanged.value = false
      }
    },
    [removeSubscribe.fulfilled]: (state, action) => {
      if (action.payload.length) {
        state.subscribes = []
        state.subscribes.push(...(action.payload))
      }
    },
    [addSubscribe.fulfilled]: (state, action) => {
      if (action.payload.length) {
        state.subscribes = []
        state.subscribes.push(...(action.payload))
      }
    },
    [addItemToPlanner.fulfilled]: (state, action) => {
      if (action.payload.length) {
        action.payload.forEach(([name, list]) => {
          state.planner[name] = []
          state.planner[name].push(...list)
        })
      }
    },
    [removePlannerItem.fulfilled]: (state, action) => {
      if (action.payload.length) {
        const [name, list] = action.payload
        state.planner[name] = []
        state.planner[name].push(...list)
      }
    },
  },
  reducers: {
    updatePlannerData(state, action) {
      const {
        sourceList,
        destinationList,
        removedElementIndex,
        addedElementIndex,
      } = action.payload

      const element = state.planner[sourceList][removedElementIndex]

      state.planner[sourceList].splice(removedElementIndex, 1) // remove
      state.planner[destinationList].splice(addedElementIndex, 0, element) // add

      state.plannerChanged.value = true
      state.plannerChanged.sourceList = sourceList
      state.plannerChanged.destinationList = destinationList
    },
  },
})

export const { updatePlannerData } = movieSlice.actions

export default movieSlice.reducer
