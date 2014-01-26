---
layout: entry
title: "Implementing the Repository Pattern with Entity Framework"
---
The repository pattern seems to be pretty common within the C# ecosystem. The crux of the pattern is that there should be a layer inbetween the data source layer and the business layers - that layer being the repositories. The job of a repository is to provide methods that query the underlying data source, encapsulating any ORM logic, and return business entities. Regardless of what the data source actually is, the repository should provide a common interface for extracting business entities from it.

The repository pattern provides several benefits in the realm of the unit testing. A repository is an easy layer to mock while testing, for example. The idea being that anything using your repository shouldn't need to know anything about the underlying data source in order to query business entities from it. Replacing a repository that accesses a SQL database with one that stores data in memory, for your tests, is now an option. Whether or not testing with a fake repository is wise, you could also completely replace the underlying data source without having to modify any of the layers on top. Flexibility is the point, here.

Personally, I like the repository pattern because it allows me to wrap up the ORM and create a seperate service layer on top, for all of my business logic. My services contain logic for validating business entities whenever an insert or update occurs, setting entity defaults (situational defaults that can't be done in your schema definition, for example), dispatching emails when an item is deleted, etc. The goal being to encapsulate a consistent set of rules that are all provided, for free, to clients of my services. Whether it be a website, a winform application, or console application, the same set of rules are enforced.

Services are sort of beyond this post, though. I'll mention them again at the end, but it's time to go right into code. I'm going to use a generic repository class. There are pros and cons to both using a generic repository as opposed to a repository per each business entity. Which method you choose should be based on the project and situation.

Lets assume that we're making an application that manages computer game characters. So, we'll start by designing a `Character` entity.

{% highlight csharp %}
class Character
{
    public int CharacterId { get; set; }

    public int Level { get; set; }

    public string Name { get; set; }
}
{% endhighlight %}

We'll be storing these entities in a [SQL Server Express LocalDb](http://technet.microsoft.com/en-us/library/hh510202.aspx) database, and using [Entity Framework](http://entityframework.codeplex.com/) as the ORM in this case. While Entity Framework's `DbContext` is technically both a repository and unity of work all in one, keep in mind that the underlying data source could be anything, so we'll continue making our own repository class. Now, we need a repository class that will provide a consistent set of methods for us to insert and retrieve our `Character` entities from `LocalDb`.

{% highlight csharp %}
interface IRepository<T> where T : class
{
    T Insert(T entity);

    int Count(Expression<Func<T, bool>> predicate);

    ICollection<T> Where(Expression<Func<T, bool>> predicate);
}
{% endhighlight %}

In this generic interface, we've got several methods. Right here we can see that anybody who will be accessing our repositories only has to know about calling the `Insert` method if they wish to create a new `Character`. The won't have to know how to use Entity Framework or SQL queries.

An important thing to note about this repository interface is that these methods return `ICollection` instead of `IQueryable`. This prevents implementation details of the underlying ORM from leaking outside of the repository, by forcing the result to be materialzed before leaving the repository. With an `IQueryable`, the users of the repository would still be able to evaluate queries outside of the repository. In cases where a `GetAll` method is required, you may want to consider using `IQueryable` though. Immedietly materializing a `GetAll` method on top of a large data set would be bad. While the goal of the repository is to encapsulate the details of the ORM, it should also take into account performance related issues such as this.

{% highlight csharp %}
class Repository<T> : IRepository<T> where T : class
{
    private readonly IDataContext m_context;

    public Repository(IDataContext context)
    {
        m_context = context;
    }

    public T Insert(T entity)
    {
        var entities = m_context.GetDbSet<T>();

        return entities.Add(entity);
    }

    public int Count(Expression<Func<T, bool>> predicate)
    {
        var entities = m_context.GetDbSet<T>();

        return entities.Count(predicate);
    }

    public ICollection<T> Where(Expression<Func<T, bool>> predicate)
    {
        var entities = m_context.GetDbSet<T>();

        return entities.Where(predicate).ToList();
    }
}
{% endhighlight %}

The actual implementation of the repository contains all of the underlying data source adapter-specific logic required to map data from the data source to the business entities. I've only got a few example methods here, but it shows how you'd provide a generic way to use Entity Framework, while allowing for some flexibility with your queries, specifically the `Where` method and its' `predicate` parameter.

The constructor for the repository expects an `IDataContext`. This could just be the `DbContext` itself, but in this example `IDataContext` is another interface of ours. This is Entity Framework specific, so I'm not going to go into much detail on it

{% highlight csharp %}
interface IDataContext : IDisposable
{
    int SaveChanges();

    IDbSet<T> GetDbSet<T>() where T : class;
}
{% endhighlight %}

Basically, with this interface we are saying that we'd like to give the repository access to Entity Framework, but in an effort to keep things as loosly coupled as possible, we're going to be selective about what we give it. The `SaveChanges` method is provided by `DbContext`. The repository class takes this `IDataContext` as a constructor parameter. As a user of the repository, once we've finished inserting, updating or deleting our records, we would call `SaveChanges` of this context class to actually commit them to the underlying data store. Generally, you'd create a single `IDataContext` class, and use it amongst all needed repositories so that your changes exist within a single transaction so to speak.

{% highlight csharp %}
class DataContext : DbContext, IDataContext
{
    public IDbSet<T> GetDbSet<T>() where T : class
    {
        return Set<T>();
    }
}
{% endhighlight %}

Now, with our repository in place, we're free to start using it. This is an example of a service that would use the repository. It's using the [IoC](http://en.wikipedia.org/wiki/Inversion_of_control) pattern, so the repository in this case has already been instanciated, with the given `IDataContext`, and is being passed into the service through the constructor.

{% highlight csharp %}
class CharacterService : ICharacterService
{
    private readonly IRepository<Character> m_characters;

    public CharacterService(IRepository<Character> characters)
    {
        m_characters = characters;
    }

    public Character Insert(Character character)
    {
        // character defaults
        character.Level = 1;

        // perform entity validation
        var validator = new CharacterValidator(m_characters);
        var validationresults = validator.Validate(character);

        if (!validationresults.IsValid)
            throw new ValidationException(validationresults.Errors);

        return m_characters.Insert(character);
    }

    public Character GetByName(string name)
    {
        return m_characters.Where(m => m.Name.ToLower() == name.ToLower())
                           .SingleOrDefault();
    }

    #endregion
}
{% endhighlight %}

Now, our services can use the repositories without having to worry about the underlying details of them. We could change up our data source, or ORM, and as long as we keep the repository interface the same then the services shouldn't need to change. Finally, just a complete example usage, without using any depndency injection.

{% highlight csharp %}
using (var context = new DataContext())
{
    var characterService = new CharacterService(new CharacterRepository(context));

    characterService.Insert(new Character
    {
        Name = "Ryan",
        Level = 1
    });

    context.SaveChanges();
}
{% endhighlight %}

Hope this helps!
