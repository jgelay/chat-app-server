import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';

function initializePassport(passport, getUser, getUserById) {
    const authenticateUser = async (username, password, done) => {
        const user = await getUser(username);
        if (user === null) {
            return done(null, false, {message: 'No user with that username'});
        }

        try {
            if (await bcrypt.compare(password, user.password)) {
                return done(null,user)
            } else {
                return done(null, false, { message: 'Incorrect password'})
            }
        } catch (e) {
            return done(e);
        }
    }

    passport.use(new LocalStrategy({},authenticateUser));
    passport.serializeUser((user,done) => {
        console.log("Testing serializer");
        return done(null,user.userid)});
    passport.deserializeUser(async (id,done) => {
        console.log("Testing deserializer");
        return done(null, await getUserById(id))
    });
}

export default initializePassport;