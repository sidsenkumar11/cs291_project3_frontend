class ServerInfo extends React.Component {
  render() {
    return React.createElement('header', null,
      React.createElement('div', {id: 'logout'},
        React.createElement('a', {onClick: this.props.logout}, 'Sign Out')
      ),
      React.createElement('h1', null, `${this.props.username}@${this.props.server}`)
    )
  }
}

class LoginScreen extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      server:   props.server,
      username: props.username,
      password: '',
      error:    ''
    }
  }

  login(event) {
    event.stopPropagation()
    event.preventDefault()

    const app = this
    const xhr = new XMLHttpRequest()
    xhr.open('POST', this.state.server + '/login')

    xhr.onload = function() {
      if(this.readyState !== this.DONE) {
        return
      }
      else if(this.status >= 300) {
        app.setState({...app.state, error: 'Login failed.'})
      }
      else {
        try {
          var token  = JSON.parse(this.responseText).token
          var stream = new EventSource(app.state.server + '/stream/' + token)
          app.setState({...app.state, error: null})
        }
        catch(e) {
          app.setState({...app.state, error: 'It go bad.'})
          console.log(e)
        }

        app.props.login({
          server:   app.state.server,
          username: app.state.username,
          stream:   stream,
          token:    token
        })
      }
    }

    let data = new FormData()
    data.set('username', this.state.username)
    data.set('password', this.state.password)
    xhr.send(data)
    return false
  }

  render() {
    return React.createElement('div', {id: 'screen'},
      React.createElement('div', {id: 'login-win'},
        React.createElement('div', {id: 'login-err'}, this.state.error),
        React.createElement('form', {onSubmit: (e) => this.login(e)},
          React.createElement('label', null, 'Server',
            React.createElement('input', {value: this.state.server, type: 'text', onChange: (e) => this.setState({server: e.target.value})}),
          ),
          React.createElement('label', null, 'User Name',
            React.createElement('input', {value: this.state.username, type: 'text', onChange: (e) => this.setState({username: e.target.value})}),
          ),
          React.createElement('label', null, 'Password',
            React.createElement('input', {value: this.state.password, type: 'password', onChange: (e) => this.setState({password: e.target.value})}),
          ),
          React.createElement('input', {value: 'Sign In', type: 'submit'})
        )
      )
    )
  }
}

class MessageBox extends React.Component {
  constructor(props) {
    super(props)
    this.autofocus = React.createRef()

    this.state = {
      message: ''
    }
  }

  componentDidMount() {
    this.autofocus.current.focus()
  }

  sendMessage(event) {
    this.props.sendMessage(event)
    this.setState({message: ''})
  }

  render() {
    return React.createElement('form', {id: 'messagebox', onSubmit: (e) => this.sendMessage(e)},
      React.createElement('div', null,
        React.createElement('input', {
          ref:          this.autofocus,
          type:         'text',
          name:         'message',
          value:        this.state.message,
          placeholder:  'Speak your mind...',
          autoComplete: 'off',
          onChange:    e => this.setState({
            message: e.target.value
          })
        })
      ),
      React.createElement('input', {
        type:  'submit',
        value: 'Send'
      })
    )
  }
}

class UserList extends React.Component {
  render() {
    const users = Array.from(this.props.users).sort()
    return React.createElement('div', {id: 'users'},
      React.createElement('div', null, 'Active Users'),
      React.createElement('ul', null, users.map(
        user => React.createElement('li', {key: user}, user)
      ))
    )
  }
}

class MessageList extends React.Component {
  constructor(props) {
    super(props)
    this.pin = React.createRef()
  }

  componentDidUpdate() {
    this.pin.current.scrollIntoView(false)
  }

  formatDate(event) {
    let d = new Date(event.time * 1000)
    let m = ('0' + d.getMinutes()).slice(-2)
    return d.getHours() + ':' + m
  }

  render() {
    let prev = {}
    return React.createElement('div', {id: 'messages'},
      React.createElement('ul', null, this.props.events.map(event => {
        if(event.type === 'Message') {
          if(prev.type === 'Message' && event.user == prev.user && event.time < prev.time + 60) {
            prev = event
            return React.createElement('li', {key: event.id, className: 'user'}, event.message)
          }

          prev = event
          return React.createElement('li', {key: event.id, className: 'user'},
            React.createElement('div', {className: 'sender'},
              event.user,
              React.createElement('span', {className: 'time'}, this.formatDate(event))
            ),
            event.message
          )
        }

        prev = event
        return React.createElement('li', {key: event.id, className: 'note'}, event.message)
      })),
      React.createElement('div', {ref: this.pin})
    )
  }
}

class App extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      server:   window.location,
      username: '',
      stream:   null,
      token:    null,

      users:    new Set(),
      status:   'Server is bored...',
      events:   []
    }
  }

  parse(event, message = null) {
    let data = JSON.parse(event.data)
    return {
      id: event.lastEventId,
      message: message || data.message,
      time: data.created,
      type: event.type,
      user: data.user,
    }
  }

  sendMessage(event) {
    if(this.state.stream && this.state.token) {
      event.stopPropagation()
      event.preventDefault()

      const xhr = new XMLHttpRequest()
      xhr.open('POST', this.state.server + '/message')
      xhr.setRequestHeader("Authorization", "Bearer " + this.state.token)
      xhr.send(new FormData(event.target))
      return false
    }
  }

  logout() {
    if(this.state.stream) {
      this.state.stream.close()
    }

    this.setState({
      ...this.state,
      events: new Array(),
      users:  new Set(),
      stream: null,
      token:  null
    })
  }

  login(values) {
    values.stream.addEventListener('Join', e => {
      let data   = JSON.parse(e.data)
      let event  = this.parse(e, data.user + ' has joined the channel')
      let events = this.state.events.concat(event)

      this.state.users.add(data.user)
      this.setState({...this.state, events})
    })

    values.stream.addEventListener('Part', e => {
      let data   = JSON.parse(e.data)
      let event  = this.parse(e, data.user + ' has left the channel')
      let events = this.state.events.concat(event)

      this.state.users.delete(data.user)
      this.setState({...this.state, events})
    })

    values.stream.addEventListener('Users', e => {
      let users = new Set(JSON.parse(e.data).users)
      this.setState({...this.state, users})
    })

    values.stream.addEventListener('Message', e => {
      let event  = this.parse(e)
      let events = this.state.events.concat(event)
      this.setState({...this.state, events})
    })

    values.stream.addEventListener('ServerStatus', e => {
      let data   = JSON.parse(e.data)
      let event  = this.parse(e, data.status)
      let events = this.state.events.concat(event)
      this.setState({...this.state, events, status: data.status})
    })

    values.stream.addEventListener('Disconnect', e => {
      this.logout()
    })

    values.stream.onmessage = e => {
      console.warn('Unhandled event:')
      console.warn(e)
    }

    this.setState({
      ...this.state,
      ...values
    })
  }

  render() {
    if(this.state.stream === null) {
      return React.createElement(LoginScreen, {
        login:    values => this.login(values),
        server:   this.state.server,
        username: this.state.username
      })
    }

    return React.createElement('div', null,
      React.createElement(ServerInfo, {
        logout:   event => this.logout(),
        server:   this.state.server,
        username: this.state.username,
        status:   this.state.status
      }),
      React.createElement(UserList,    {users:  this.state.users}),
      React.createElement(MessageList, {events: this.state.events}),
      React.createElement(MessageBox,  {
        sendMessage: event => this.sendMessage(event),
      }),
    )
  }
}

ReactDOM.render(
  React.createElement(App, null),
  document.getElementById('app')
)
