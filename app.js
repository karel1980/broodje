var express = require('express'),
    passport = require('passport'),
    util = require('util'),
    orm = require('orm'),
    GoogleStrategy = require('passport-google').Strategy;

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Google profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the GoogleStrategy within Passport.
//   Strategies in passport require a `validate` function, which accept
//   credentials (in this case, an OpenID identifier and profile), and invoke a
//   callback with a user object.
passport.use(new GoogleStrategy({
    returnURL: 'http://localhost:3000/auth/google/return',
    realm: 'http://localhost:3000/'
  },
  function(identifier, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's Google profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Google account with a user record in your database,
      // and return that user instead.
      profile.identifier = identifier;
      return done(null, profile);
    });
  }
));




var app = express.createServer();

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: 'broodjeaapzonderchocoaub' }));
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());

  app.use(express.static(__dirname + '/../../public'));
  app.use(orm.express("mysql://broodje:sandwich@localhost/broodje", {
    define: function(db,models) {
      models.user = db.define("user", {
          display_name: String,
          identifier: String,
        }, {
          id: "id"
        }
      );
      models.bestel = db.define("bestelling", {
          beleg: String,
          soort: String,
          opmerkingen: String,
          besteld_op: Date
        }, {
          id: "id"
        }
      );
      models.bestel.hasOne('owner', models.user, { autoFetch: true });
      models.run = db.define("run", {
          run_on: Date
        }, {
          id: "id"
        }
      );
      models.run.hasOne('runner', models.user, { autoFetch: true });
    }
  }));
  app.use(app.router);
});

app.get('/', function(req, res){
  res.render('index', { user: req.user });
});

app.get('/vandaag', function(req, res) {
  var now = new Date();
  var today = today_str();
  //TODO :what about last month of year, last day of month? will it roll over automatically?
  var tomorrow = "" + now.getFullYear() + "-" + (1+now.getMonth()) + "-" + (now.getDate()+1);
  req.models.bestel.find({besteld_op:orm.between(today,tomorrow)}, function(err, orders) {
    if (err) {
      console.log(err);
    }
    req.models.run.find({run_on: today}, function(err, runs) {
      var run;
      if (runs.length > 0) {
        run = runs[0];
      }
      res.render('orders', { user: req.user, orders: orders, run: run });
    });
  });
});

app.post('/', function(req, res){
  if (!req.user) {
    res.redirect('/'); // not logged in
    return;
  }
  req.models.user.get(req.user.identity, function(err,user) {
    if (err) {
      console.log(err);
    }

    req.models.user.find({identifier: req.user.identifier}, function(err,users) {
      var user = users[0];
      var bestelling = {
        owner_id: user.id,
        beleg: req.body.beleg,
        soort: req.body.soort == 'ander' ? req.body.soort_ander : req.body.soort,
        opmerkingen: req.body.opmerkingen
      };
      
      req.models.bestel.create([bestelling], function(err, b) {
        if (err) {
          console.log(err);
        }
        res.render('order-added', { user: req.user, order: bestelling });
      });

    });
  });
});

app.post('/halen', function(req, res) {
  req.models.user.find({identifier: req.user.identifier}, function(err, users) {
    if (err) {
      console.log(err);
    }
    var user = users[0];
    var today = today_str();
    req.models.run.find({run_on: today}, function(err, runs) {
      if (err) {
        console.log(err);
      }
      if (runs.length === 0) {
        req.models.run.create({runner_id: user.id, run_on: new Date()}, function(err, runs) {
          if (err) {
            console.log(err);
          }
          res.render('run-ok', { user: req.user });
        });
      } else {
        if (!req.body.force) {
          res.render('run-exists', { user: req.user, run: runs[0] });
        } else {
          req.models.user.find({identifier: req.user.identifier}, function(err,users) {
            runs[0].runner_id = users[0];
            runs[0].save();
            res.render('run-ok', { user: req.user });
          });
        }
      }
    });
  });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve redirecting
//   the user to google.com.  After authenticating, Google will redirect the
//   user back to this application at /auth/google/return
app.get('/auth/google', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

// GET /auth/google/return
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/return', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    req.models.user.exists({identifier:req.user.identifier}, function(err, exists) {
      if (!exists) {
        req.models.user.create([{ identifier: req.user.identifier, display_name: req.user.displayName }],
          function(err, users) {
            if (err) {
              console.log(err);
            }
            req.user.user_id = users[0].id;
            console.log("created user:", users[0]);
          } 
        );
      } else {
        req.models.user.find({identifier:req.user.identifier}, function (err, users) {
            if (err) {
              console.log(err);
            }
            var user = users[0];
            user.display_name = req.user.displayName;
            user.save(function (err) {
                if (err) {
                  console.log(err);
                }
                console.log("updated user!");
                req.user.user_id = user.id;
            });
        });
      }
    });
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(3000);


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}

function today_str() {
  var now = new Date();
  return "" + now.getFullYear() + "-" + (1+now.getMonth()) + "-" + now.getDate();
}
